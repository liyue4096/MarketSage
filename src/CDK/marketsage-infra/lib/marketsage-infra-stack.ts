import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export class MarketsageInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // VPC Configuration
    // ========================================
    // VPC retained for Aurora - Lambdas don't use VPC (they use RDS Data API via HTTPS)
    // NOTE: After deployment, manually delete NAT Gateway in AWS Console to save ~$7.56/week
    // The NAT Gateway is no longer needed since Lambdas use RDS Data API instead of VPC
    const vpc = new ec2.Vpc(this, 'MarketsageVpc', {
      maxAzs: 2,
      natGateways: 1, // Keep for now - delete manually in AWS Console after deployment
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ========================================
    // Security Groups
    // ========================================
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    const auroraSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSG', {
      vpc,
      description: 'Security group for Aurora PostgreSQL',
      allowAllOutbound: false,
    });

    // Allow Lambda to connect to Aurora
    auroraSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda access to PostgreSQL'
    );

    // ========================================
    // Secrets Manager for DB Credentials
    // ========================================
    const dbCredentials = new secretsmanager.Secret(this, 'AuroraCredentials', {
      secretName: 'marketsage/aurora/credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'marketsage_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // ========================================
    // Aurora PostgreSQL Serverless v2
    // ========================================
    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      defaultDatabaseName: 'marketsage',
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [auroraSecurityGroup],
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      storageEncrypted: true,
      backup: {
        retention: cdk.Duration.days(7),
      },
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      enableDataApi: true, // Enable Data API for Query Editor
    });

    // ========================================
    // DynamoDB Table for Analysis Storage
    // ========================================
    // Single-table design for GAN analysis results
    // Primary Key: PK = ticker#date (e.g., "AAPL#2026-01-22"), SK = thought_signature
    // GSI1: For lookup by thought_signature (retro-exam)
    // GSI2: For listing by ticker with date sorting
    // Note: Table was created manually, referencing existing table
    const analysisTable = dynamodb.Table.fromTableName(
      this,
      'AnalysisTable',
      'marketsage-analysis'
    );

    // ========================================
    // DynamoDB Table for Company Descriptions
    // ========================================
    // Simple key-value store: ticker -> description
    // More reliable than Aurora (no sleep/wake delay)
    const companyDescriptionsTable = new dynamodb.Table(this, 'CompanyDescriptionsTable', {
      tableName: 'marketsage-company-descriptions',
      partitionKey: { name: 'ticker', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ========================================
    // S3 Bucket for Full Report Storage
    // ========================================
    // Stores complete analysis reports as JSON for download
    // Path: s3://marketsage-reports/{date}/{ticker}.json
    const reportsBucket = new s3.Bucket(this, 'ReportsBucket', {
      bucketName: `marketsage-reports-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          // Move old reports to Glacier after 1 year
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
    });

    // ========================================
    // Lambda Layer for shared dependencies
    // ========================================
    // Path to backend folder (relative to CDK lib directory)
    // __dirname = src/CDK/marketsage-infra/lib -> go up 3 levels to src, then into backend
    const backendPath = path.join(__dirname, '../../../backend');

    const lambdaLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda-layers/shared')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared dependencies for MarketSage Lambda functions',
    });

    // ========================================
    // Lambda Functions
    // ========================================

    // Common Lambda environment variables
    // Using RDS Data API instead of direct TCP connection (no VPC needed)
    const commonEnv = {
      DB_SECRET_ARN: dbCredentials.secretArn,
      DB_CLUSTER_ARN: auroraCluster.clusterArn,
      DB_CLUSTER_ENDPOINT: auroraCluster.clusterEndpoint.hostname, // Keep for reference
      DB_NAME: 'marketsage',
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Technical Scanner Lambda - Identifies MA breakthroughs
    // NO VPC - uses RDS Data API via HTTPS (saves $7.56/week NAT Gateway cost)
    const technicalScannerLambda = new lambda.Function(this, 'TechnicalScannerLambda', {
      functionName: 'marketsage-technical-scanner',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/technical-scanner')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        ...commonEnv,
        FINANCIAL_API_KEY_SECRET: 'marketsage/api/polygon',
      },
      layers: [lambdaLayer],
    });

    // Bull Agent Lambda - Generates bullish thesis
    const bullAgentLambda = new lambda.Function(this, 'BullAgentLambda', {
      functionName: 'marketsage-bull-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/bull-agent')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        ...commonEnv,
        AGENT_ROLE: 'BULL',
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
      },
      layers: [lambdaLayer],
    });

    // Bear Agent Lambda - Generates bearish thesis
    const bearAgentLambda = new lambda.Function(this, 'BearAgentLambda', {
      functionName: 'marketsage-bear-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/bear-agent')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        ...commonEnv,
        AGENT_ROLE: 'BEAR',
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
      },
      layers: [lambdaLayer],
    });

    // Rebuttal Agent Lambda - Handles debate rounds
    const rebuttalAgentLambda = new lambda.Function(this, 'RebuttalAgentLambda', {
      functionName: 'marketsage-rebuttal-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/rebuttal-agent')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        ...commonEnv,
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
      },
      layers: [lambdaLayer],
    });

    // Judge Agent Lambda - Synthesizes final verdict
    const judgeAgentLambda = new lambda.Function(this, 'JudgeAgentLambda', {
      functionName: 'marketsage-judge-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/judge-agent')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        ...commonEnv,
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
      },
      layers: [lambdaLayer],
    });

    // Translate Agent Lambda - Translates reports to Chinese
    const translateAgentLambda = new lambda.Function(this, 'TranslateAgentLambda', {
      functionName: 'marketsage-translate-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/translate-agent')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        ...commonEnv,
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
      },
      layers: [lambdaLayer],
    });

    // Report Persister Lambda - Saves reports to DB
    const reportPersisterLambda = new lambda.Function(this, 'ReportPersisterLambda', {
      functionName: 'marketsage-report-persister',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/report-persister')),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: commonEnv,
      layers: [lambdaLayer],
    });

    // Retro Exam Lambda - Reviews past predictions at T+60
    const retroExamLambda = new lambda.Function(this, 'RetroExamLambda', {
      functionName: 'marketsage-retro-exam',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/retro-exam')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: {
        ...commonEnv,
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
        FINANCIAL_API_KEY_SECRET: 'marketsage/api/polygon',
      },
      layers: [lambdaLayer],
    });

    // API Handler Lambda - Handles frontend requests
    const apiHandlerLambda = new lambda.Function(this, 'ApiHandlerLambda', {
      functionName: 'marketsage-api-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/api-handler')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...commonEnv,
        ANALYSIS_TABLE_NAME: analysisTable.tableName,
        COMPANY_DESCRIPTIONS_TABLE: companyDescriptionsTable.tableName,
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
      },
      layers: [lambdaLayer],
    });

    // Grant DynamoDB read access to API handler
    analysisTable.grantReadData(apiHandlerLambda);
    companyDescriptionsTable.grantReadData(apiHandlerLambda);

    // Grant S3 read access to API handler for report downloads
    reportsBucket.grantRead(apiHandlerLambda);

    // Data Loader Lambda - Loads market data from Polygon into database
    const dataLoaderLambda = new lambda.Function(this, 'DataLoaderLambda', {
      functionName: 'marketsage-data-loader',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/data-loader')),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      environment: {
        ...commonEnv,
        FINANCIAL_API_KEY_SECRET: 'marketsage/api/polygon',
      },
      layers: [lambdaLayer],
    });

    // Signal Generator Lambda - Detects MA crossover signals for Russell 1000 at market close
    const signalGeneratorLambda = new lambda.Function(this, 'SignalGeneratorLambda', {
      functionName: 'marketsage-signal-generator',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/signal-generator')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: commonEnv,
      layers: [lambdaLayer],
    });

    // Report Selector Lambda - Selects tickers for daily reports with quota management
    const reportSelectorLambda = new lambda.Function(this, 'ReportSelectorLambda', {
      functionName: 'marketsage-report-selector',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/report-selector')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        ...commonEnv,
        ANALYSIS_TABLE_NAME: analysisTable.tableName,
      },
      layers: [lambdaLayer],
    });

    // Analysis Store Lambda - Stores GAN analysis results to DynamoDB and S3
    const analysisStoreLambda = new lambda.Function(this, 'AnalysisStoreLambda', {
      functionName: 'marketsage-analysis-store',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/analysis-store')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ANALYSIS_TABLE_NAME: analysisTable.tableName,
        REPORTS_BUCKET_NAME: reportsBucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      layers: [lambdaLayer],
    });

    // Grant DynamoDB access to analysis store Lambda
    analysisTable.grantReadWriteData(analysisStoreLambda);

    // Grant S3 write access to analysis store Lambda
    reportsBucket.grantWrite(analysisStoreLambda);

    // Ticker Enricher Lambda - Generates company descriptions using Gemini API
    const tickerEnricherLambda = new lambda.Function(this, 'TickerEnricherLambda', {
      functionName: 'marketsage-ticker-enricher',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/ticker-enricher')),
      timeout: cdk.Duration.minutes(15), // Long timeout for batch processing
      memorySize: 1024,
      environment: {
        ...commonEnv,
        GEMINI_API_KEY_SECRET: 'marketsage/api/gemini',
        BATCH_SIZE: '50',
        CONCURRENCY: '10',
      },
      layers: [lambdaLayer],
    });

    // Grant DynamoDB read access to report selector Lambda
    analysisTable.grantReadData(reportSelectorLambda);

    // Grant Lambda functions access to secrets and database
    const allLambdas = [
      technicalScannerLambda,
      bullAgentLambda,
      bearAgentLambda,
      rebuttalAgentLambda,
      judgeAgentLambda,
      reportPersisterLambda,
      retroExamLambda,
      apiHandlerLambda,
      dataLoaderLambda,
      signalGeneratorLambda,
      reportSelectorLambda,
      tickerEnricherLambda,
    ];

    // Grant permissions for RDS Data API access (HTTPS-based, no VPC needed)
    allLambdas.forEach((fn) => {
      dbCredentials.grantRead(fn);
      // RDS Data API permissions (replaces VPC-based TCP connection)
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'rds-data:ExecuteStatement',
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction',
        ],
        resources: [auroraCluster.clusterArn],
      }));
    });

    // Grant specific Lambdas access to additional secrets
    const geminiSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:marketsage/api/gemini*`;
    const polygonSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:marketsage/api/polygon*`;

    [bullAgentLambda, bearAgentLambda, rebuttalAgentLambda, judgeAgentLambda, translateAgentLambda, retroExamLambda, tickerEnricherLambda].forEach((fn) => {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [geminiSecretArn],
      }));
    });

    [technicalScannerLambda, retroExamLambda, dataLoaderLambda].forEach((fn) => {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [polygonSecretArn],
      }));
    });

    // Grant technical-scanner permission to invoke report-selector
    reportSelectorLambda.grantInvoke(technicalScannerLambda);

    // ========================================
    // Step Functions - Adversarial Analysis Workflow
    // ========================================

    // Step 1: Technical Scanner
    const scanTask = new tasks.LambdaInvoke(this, 'ScanForBreakthroughs', {
      lambdaFunction: technicalScannerLambda,
      payloadResponseOnly: true,  // Extracts just the Lambda response payload
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    scanTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 2: Sequential Bull and Bear thesis generation
    const bullTask = new tasks.LambdaInvoke(this, 'GenerateBullThesis', {
      lambdaFunction: bullAgentLambda,
      payloadResponseOnly: true,  // Extracts just the Lambda response payload
      resultPath: '$.bullThesis',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff for Gemini API transient failures
    bullTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2, // 10s, 20s, 40s
    });

    const bearTask = new tasks.LambdaInvoke(this, 'GenerateBearThesis', {
      lambdaFunction: bearAgentLambda,
      payloadResponseOnly: true,  // Extracts just the Lambda response payload
      resultPath: '$.bearThesis',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff for Gemini API transient failures
    bearTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // SEQUENTIAL EXECUTION: Run bull then bear (not parallel) for reliability
    // Step 2a: Combine bull and bear results into theses array for rebuttal agent
    const combineTheses = new stepfunctions.Pass(this, 'CombineTheses', {
      parameters: {
        'ticker.$': '$.bullThesis.ticker',
        'companyName.$': '$.companyName',
        'triggerType.$': '$.triggerType',
        'closePrice.$': '$.closePrice',
        'peers.$': '$.peers',
        'theses.$': 'States.Array($.bullThesis, $.bearThesis)',
      },
      resultPath: '$.combinedInput',
    });

    // Step 3: Rebuttal round - uses combined theses
    const rebuttalTask = new tasks.LambdaInvoke(this, 'GenerateRebuttals', {
      lambdaFunction: rebuttalAgentLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'ticker.$': '$.combinedInput.ticker',
        'theses.$': '$.combinedInput.theses',
      }),
      payloadResponseOnly: true,
      resultPath: '$.rebuttals',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    rebuttalTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 4: Judge synthesis - receives all data
    const judgeTask = new tasks.LambdaInvoke(this, 'SynthesizeVerdict', {
      lambdaFunction: judgeAgentLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'ticker.$': '$.combinedInput.ticker',
        'theses.$': '$.combinedInput.theses',
        'rebuttals.$': '$.rebuttals',
      }),
      payloadResponseOnly: true,
      resultPath: '$.verdict',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    judgeTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 5: Store analysis to DynamoDB
    const storeAnalysisTask = new tasks.LambdaInvoke(this, 'StoreAnalysis', {
      lambdaFunction: analysisStoreLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'action': 'store-analysis',
        'triggerDate.$': '$.scanDate',
        'triggerType.$': '$.triggerType',
        'activeSignals.$': '$.activeSignals',
        'closePrice.$': '$.closePrice',
        'peers.$': '$.peers',
        'companyName.$': '$.companyName',
        'bullOpening.$': '$.bullThesis',
        'bearOpening.$': '$.bearThesis',
        'rebuttals.$': '$.rebuttals',
        'judge.$': '$.verdict',
      }),
      payloadResponseOnly: true,
      resultPath: '$.storeResult',  // Preserve state for subsequent steps
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    storeAnalysisTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 6: Translate report to Chinese (including Opening Arguments and Cross-Examination)
    const translateTask = new tasks.LambdaInvoke(this, 'TranslateReport', {
      lambdaFunction: translateAgentLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'ticker.$': '$.combinedInput.ticker',
        'triggerDate.$': '$.scanDate',
        'reportContent.$': '$.verdict.reportContent',
        'consensusSummary.$': '$.verdict.consensusSummary',
        'bullOpening.$': '$.bullThesis',
        'bearOpening.$': '$.bearThesis',
        'rebuttals.$': '$.rebuttals',
      }),
      payloadResponseOnly: true,
      resultPath: '$.translation',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    translateTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 7: Update stored analysis with Chinese translation (including Opening Arguments and Cross-Examination)
    const updateTranslationTask = new tasks.LambdaInvoke(this, 'UpdateTranslation', {
      lambdaFunction: analysisStoreLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'action': 'store-analysis',
        'triggerDate.$': '$.scanDate',
        'triggerType.$': '$.triggerType',
        'activeSignals.$': '$.activeSignals',
        'closePrice.$': '$.closePrice',
        'peers.$': '$.peers',
        'companyName.$': '$.companyName',
        'bullOpening.$': '$.bullThesis',
        'bearOpening.$': '$.bearThesis',
        'rebuttals.$': '$.rebuttals',
        'judge.$': '$.verdict',
        'reportContentChinese.$': '$.translation.reportContentChinese',
        'consensusSummaryChinese.$': '$.translation.consensusSummaryChinese',
        'bullOpeningChinese.$': '$.translation.bullOpeningChinese',
        'bearOpeningChinese.$': '$.translation.bearOpeningChinese',
        'rebuttalsChinese.$': '$.translation.rebuttalsChinese',
      }),
      payloadResponseOnly: true,
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff
    updateTranslationTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Map state to process each triggered stock - SEQUENTIAL, one at a time
    const processStockMap = new stepfunctions.Map(this, 'ProcessEachStock', {
      maxConcurrency: 1,  // Process one stock at a time to avoid Gemini rate limits
      itemsPath: '$.triggeredStocks',
      resultPath: '$.processedReports',
      parameters: {
        'ticker.$': '$$.Map.Item.Value.ticker',
        'companyName.$': '$$.Map.Item.Value.companyName',
        'triggerType.$': '$$.Map.Item.Value.triggerType',
        'activeSignals.$': '$$.Map.Item.Value.activeSignals',
        'closePrice.$': '$$.Map.Item.Value.closePrice',
        'peers.$': '$$.Map.Item.Value.peers',
        'scanDate.$': '$.scanDate',
      },
    });

    // Sequential chain: bull → bear → combine → rebuttal → judge → store → translate → update
    const stockProcessingChain = bullTask
      .next(bearTask)
      .next(combineTheses)
      .next(rebuttalTask)
      .next(judgeTask)
      .next(storeAnalysisTask)
      .next(translateTask)
      .next(updateTranslationTask);

    processStockMap.itemProcessor(stockProcessingChain);

    // Choice state - check if any breakthroughs found
    const hasBreakthroughs = new stepfunctions.Choice(this, 'HasBreakthroughs')
      .when(
        stepfunctions.Condition.numberGreaterThan('$.triggeredStocksCount', 0),
        processStockMap
      )
      .otherwise(new stepfunctions.Succeed(this, 'NoBreakthroughsFound'));

    // Main workflow chain
    const workflowDefinition = scanTask.next(hasBreakthroughs);

    // Create the state machine
    const analysisStateMachine = new stepfunctions.StateMachine(this, 'AdversarialAnalysisStateMachine', {
      stateMachineName: 'marketsage-adversarial-analysis',
      definitionBody: stepfunctions.DefinitionBody.fromChainable(workflowDefinition),
      timeout: cdk.Duration.hours(2),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogs', {
          logGroupName: '/aws/stepfunctions/marketsage-analysis',
          retention: logs.RetentionDays.TWO_WEEKS,
        }),
        level: stepfunctions.LogLevel.ALL,
      },
    });

    // ========================================
    // Step Functions - Retro Exam Workflow
    // ========================================
    const retroExamTask = new tasks.LambdaInvoke(this, 'RunRetroExam', {
      lambdaFunction: retroExamLambda,
      outputPath: '$.Payload',
    });

    const retroStateMachine = new stepfunctions.StateMachine(this, 'RetroExamStateMachine', {
      stateMachineName: 'marketsage-retro-exam',
      definitionBody: stepfunctions.DefinitionBody.fromChainable(retroExamTask),
      timeout: cdk.Duration.hours(1),
      tracingEnabled: true,
    });

    // ========================================
    // Step Functions - Market Data Pipeline
    // ========================================
    // Orchestrates: load-snapshot → load-russell-sma (loop) → generate-signals

    // Step 1: Load price snapshot from Polygon
    const loadSnapshotTask = new tasks.LambdaInvoke(this, 'LoadPriceSnapshot', {
      lambdaFunction: dataLoaderLambda,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'load-snapshot',
      }),
      resultPath: '$.snapshotResult',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff for transient failures
    loadSnapshotTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2, // 5s, 10s, 20s
    });

    // Step 2: Initialize SMA batch processing
    const initSmaBatch = new stepfunctions.Pass(this, 'InitSmaBatch', {
      result: stepfunctions.Result.fromObject({ batchStart: 0 }),
      resultPath: '$.smaBatch',
    });

    // Step 2a: Load SMA data for current batch
    const loadSmaBatchTask = new tasks.LambdaInvoke(this, 'LoadSmaBatch', {
      lambdaFunction: dataLoaderLambda,
      payload: stepfunctions.TaskInput.fromObject({
        'action': 'load-russell-sma',
        'batchStart.$': '$.smaBatch.batchStart',
        'batchSize': 50,
      }),
      resultPath: '$.smaResult',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff for transient failures
    loadSmaBatchTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 2b: Update batch state for next iteration (only if data exists)
    const updateBatchState = new stepfunctions.Pass(this, 'UpdateBatchState', {
      parameters: {
        'batchStart.$': '$.smaResult.Payload.data[0].o',
      },
      resultPath: '$.smaBatch',
    });

    // Step 2c: Check if we need to continue looping
    // Lambda returns data array only if hasMore=true, otherwise data is undefined
    const checkMoreBatches = new stepfunctions.Choice(this, 'CheckMoreBatches');

    // Step 3: Generate MA crossover signals
    const generateSignalsTask = new tasks.LambdaInvoke(this, 'GenerateMaSignals', {
      lambdaFunction: signalGeneratorLambda,
      payload: stepfunctions.TaskInput.fromObject({
        action: 'generate-signals',
      }),
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // Add retry with exponential backoff for transient failures
    generateSignalsTask.addRetry({
      errors: ['States.TaskFailed', 'Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Build the SMA loop: load batch → check if more → (update state → loop) or (generate signals)
    const smaLoop = loadSmaBatchTask
      .next(checkMoreBatches
        .when(
          stepfunctions.Condition.isPresent('$.smaResult.Payload.data[0]'),
          updateBatchState.next(loadSmaBatchTask) // More batches, update state and loop
        )
        .otherwise(generateSignalsTask) // Done with batches, generate signals
      );

    // Chain: snapshot → init batch → sma loop
    const marketDataPipeline = loadSnapshotTask
      .next(initSmaBatch)
      .next(smaLoop);

    const marketDataStateMachine = new stepfunctions.StateMachine(this, 'MarketDataPipelineStateMachine', {
      stateMachineName: 'marketsage-market-data-pipeline',
      definitionBody: stepfunctions.DefinitionBody.fromChainable(marketDataPipeline),
      timeout: cdk.Duration.hours(2), // Increased timeout for batch processing
      tracingEnabled: true,
    });

    // ========================================
    // EventBridge Rules - Scheduled Triggers
    // ========================================

    // Market Data Pipeline at 4:30 PM ET (21:30 UTC during EST)
    // Runs: load-snapshot → load-russell-sma → generate-signals
    new events.Rule(this, 'MarketDataPipelineRule', {
      ruleName: 'marketsage-market-data-pipeline',
      schedule: events.Schedule.cron({
        minute: '30',
        hour: '21', // 21:30 UTC = 4:30 PM ET (EST)
        weekDay: 'MON-FRI',
      }),
      targets: [new targets.SfnStateMachine(marketDataStateMachine)],
    });

    // Daily analysis at 7 PM ET (00:00 UTC next day during EST, 23:00 UTC during EDT)
    // Processes tickers with active signals generated by signal-generator
    new events.Rule(this, 'DailyAnalysisRule', {
      ruleName: 'marketsage-daily-analysis',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '0', // Midnight UTC = 7 PM ET (EST) / 8 PM ET (EDT)
        weekDay: 'TUE-SAT', // Run after Mon-Fri market close
      }),
      targets: [new targets.SfnStateMachine(analysisStateMachine)],
    });

    // Daily retro exam check (runs every day to check for T+60 reports)
    new events.Rule(this, 'DailyRetroExamRule', {
      ruleName: 'marketsage-daily-retro-exam',
      schedule: events.Schedule.cron({
        minute: '30',
        hour: '0',
        weekDay: 'TUE-SAT',
      }),
      targets: [new targets.SfnStateMachine(retroStateMachine)],
    });

    // ========================================
    // API Gateway
    // ========================================
    const api = new apigateway.RestApi(this, 'MarketsageApi', {
      restApiName: 'MarketSage API',
      description: 'API for MarketSage frontend',
      deployOptions: {
        stageName: 'prod',
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
        cachingEnabled: false, // Disable caching - cache key doesn't include path params
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
      },
    });

    // API Gateway Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(apiHandlerLambda);

    // API Routes
    const reportsResource = api.root.addResource('reports');
    reportsResource.addMethod('GET', lambdaIntegration); // Get all reports for a date

    const reportResource = reportsResource.addResource('{ticker}');
    reportResource.addMethod('GET', lambdaIntegration); // Get specific report

    // Download route: /reports/{ticker}/download
    const downloadResource = reportResource.addResource('download');
    downloadResource.addMethod('GET', lambdaIntegration); // Get presigned URL for S3 download

    const datesResource = api.root.addResource('dates');
    datesResource.addMethod('GET', lambdaIntegration); // Get available dates

    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration); // Health check

    // Signals API routes
    const signalsResource = api.root.addResource('signals');
    signalsResource.addMethod('GET', lambdaIntegration); // Get signals for a date

    const signalDatesResource = signalsResource.addResource('dates');
    signalDatesResource.addMethod('GET', lambdaIntegration); // Get available signal dates

    // API Key for basic protection
    const apiKey = api.addApiKey('MarketsageApiKey', {
      apiKeyName: 'marketsage-frontend-key',
    });

    const usagePlan = api.addUsagePlan('MarketsageUsagePlan', {
      name: 'Frontend Usage Plan',
      throttle: {
        rateLimit: 50,
        burstLimit: 100,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage: api.deploymentStage });

    // ========================================
    // Amplify App for Frontend Hosting
    // ========================================
    const amplifyRole = new iam.Role(this, 'AmplifyRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: 'IAM role for Amplify to build and deploy',
    });

    amplifyRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
    );

    const amplifyApp = new amplify.CfnApp(this, 'MarketsageAmplifyApp', {
      name: 'marketsage-frontend',
      iamServiceRole: amplifyRole.roleArn,
      platform: 'WEB_COMPUTE', // Next.js SSR support
      environmentVariables: [
        {
          name: 'NEXT_PUBLIC_API_URL',
          value: api.url,
        },
        {
          name: '_CUSTOM_IMAGE',
          value: 'amplify:al2023', // Amazon Linux 2023 for Node.js 20
        },
      ],
      customRules: [
        {
          source: '/<*>',
          target: '/index.html',
          status: '404-200',
        },
      ],
      buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd src/frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: src/frontend/.next
    files:
      - '**/*'
  cache:
    paths:
      - src/frontend/node_modules/**/*
      - src/frontend/.next/cache/**/*
`,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: 'MarketsageApiUrl',
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify App ID',
      exportName: 'MarketsageAmplifyAppId',
    });

    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: auroraCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL Cluster Endpoint',
      exportName: 'MarketsageDbEndpoint',
    });

    new cdk.CfnOutput(this, 'StepFunctionArn', {
      value: analysisStateMachine.stateMachineArn,
      description: 'Adversarial Analysis State Machine ARN',
      exportName: 'MarketsageStateMachineArn',
    });

    new cdk.CfnOutput(this, 'AnalysisTableName', {
      value: analysisTable.tableName,
      description: 'DynamoDB Analysis Table Name',
      exportName: 'MarketsageAnalysisTable',
    });

    new cdk.CfnOutput(this, 'ReportsBucketName', {
      value: reportsBucket.bucketName,
      description: 'S3 Bucket for Full Reports',
      exportName: 'MarketsageReportsBucket',
    });
  }
}
