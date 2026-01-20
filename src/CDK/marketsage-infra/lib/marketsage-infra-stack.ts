import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
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
import * as path from 'path';

export class MarketsageInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========================================
    // VPC Configuration
    // ========================================
    const vpc = new ec2.Vpc(this, 'MarketsageVpc', {
      maxAzs: 2,
      natGateways: 1,
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
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        publiclyAccessible: false,
      }),
      readers: [
        rds.ClusterInstance.serverlessV2('reader', {
          scaleWithWriter: true,
        }),
      ],
      storageEncrypted: true,
      backup: {
        retention: cdk.Duration.days(7),
      },
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      enableDataApi: true, // Enable Data API for Query Editor
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
    const commonEnv = {
      DB_SECRET_ARN: dbCredentials.secretArn,
      DB_CLUSTER_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
      DB_NAME: 'marketsage',
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Technical Scanner Lambda - Identifies MA breakthroughs
    const technicalScannerLambda = new lambda.Function(this, 'TechnicalScannerLambda', {
      functionName: 'marketsage-technical-scanner',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/technical-scanner')),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        ...commonEnv,
        FINANCIAL_API_KEY_SECRET: 'marketsage/api/polygon', // Store API key in Secrets Manager
      },
      layers: [lambdaLayer],
    });

    // Bull Agent Lambda - Generates bullish thesis
    const bullAgentLambda = new lambda.Function(this, 'BullAgentLambda', {
      functionName: 'marketsage-bull-agent',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/bull-agent')),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
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
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnv,
      layers: [lambdaLayer],
    });

    // Data Loader Lambda - Loads market data from Polygon into database
    const dataLoaderLambda = new lambda.Function(this, 'DataLoaderLambda', {
      functionName: 'marketsage-data-loader',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(backendPath, 'lambda/data-loader')),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      environment: {
        ...commonEnv,
        FINANCIAL_API_KEY_SECRET: 'marketsage/api/polygon',
      },
      layers: [lambdaLayer],
    });

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
    ];

    allLambdas.forEach((fn) => {
      dbCredentials.grantRead(fn);
      auroraCluster.grantConnect(fn, 'marketsage_admin');
    });

    // Grant specific Lambdas access to additional secrets
    const geminiSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:marketsage/api/gemini*`;
    const polygonSecretArn = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:marketsage/api/polygon*`;

    [bullAgentLambda, bearAgentLambda, rebuttalAgentLambda, judgeAgentLambda, retroExamLambda].forEach((fn) => {
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

    // ========================================
    // Step Functions - Adversarial Analysis Workflow
    // ========================================

    // Step 1: Technical Scanner
    const scanTask = new tasks.LambdaInvoke(this, 'ScanForBreakthroughs', {
      lambdaFunction: technicalScannerLambda,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // Step 2: Parallel Bull and Bear thesis generation
    const bullTask = new tasks.LambdaInvoke(this, 'GenerateBullThesis', {
      lambdaFunction: bullAgentLambda,
      outputPath: '$.Payload',
      resultPath: '$.bullThesis',
    });

    const bearTask = new tasks.LambdaInvoke(this, 'GenerateBearThesis', {
      lambdaFunction: bearAgentLambda,
      outputPath: '$.Payload',
      resultPath: '$.bearThesis',
    });

    const parallelThesis = new stepfunctions.Parallel(this, 'ParallelThesisGeneration', {
      resultPath: '$.theses',
    });
    parallelThesis.branch(bullTask);
    parallelThesis.branch(bearTask);

    // Step 3: Rebuttal round
    const rebuttalTask = new tasks.LambdaInvoke(this, 'GenerateRebuttals', {
      lambdaFunction: rebuttalAgentLambda,
      outputPath: '$.Payload',
      resultPath: '$.rebuttals',
    });

    // Step 4: Judge synthesis
    const judgeTask = new tasks.LambdaInvoke(this, 'SynthesizeVerdict', {
      lambdaFunction: judgeAgentLambda,
      outputPath: '$.Payload',
      resultPath: '$.verdict',
    });

    // Step 5: Persist report
    const persistTask = new tasks.LambdaInvoke(this, 'PersistReport', {
      lambdaFunction: reportPersisterLambda,
      outputPath: '$.Payload',
    });

    // Map state to process each triggered stock
    const processStockMap = new stepfunctions.Map(this, 'ProcessEachStock', {
      maxConcurrency: 5,
      itemsPath: '$.triggeredStocks',
      resultPath: '$.processedReports',
    });

    const stockProcessingChain = parallelThesis
      .next(rebuttalTask)
      .next(judgeTask)
      .next(persistTask);

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
          retention: logs.RetentionDays.ONE_MONTH,
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
    // EventBridge Rules - Scheduled Triggers
    // ========================================

    // Daily analysis at 7 PM ET (00:00 UTC next day during EST, 23:00 UTC during EDT)
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

    const datesResource = api.root.addResource('dates');
    datesResource.addMethod('GET', lambdaIntegration); // Get available dates

    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', lambdaIntegration); // Health check

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
  }
}
