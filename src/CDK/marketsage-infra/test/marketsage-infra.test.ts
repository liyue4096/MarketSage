import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MarketsageInfraStack } from '../lib/marketsage-infra-stack';

describe('MarketsageInfraStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new MarketsageInfraStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    test('creates VPC with correct CIDR', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('creates public, private, and isolated subnets', () => {
      // Check for subnets (should have 6 total: 2 AZs x 3 subnet types)
      template.resourceCountIs('AWS::EC2::Subnet', 6);
    });

    test('creates NAT Gateway', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });
  });

  describe('Security Groups', () => {
    test('creates Lambda security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Lambda functions',
      });
    });

    test('creates Aurora security group', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Aurora PostgreSQL',
      });
    });
  });

  describe('Aurora PostgreSQL', () => {
    test('creates Aurora cluster with PostgreSQL engine', () => {
      template.hasResourceProperties('AWS::RDS::DBCluster', {
        Engine: 'aurora-postgresql',
        DatabaseName: 'marketsage',
        StorageEncrypted: true,
      });
    });

    test('creates writer and reader instances', () => {
      template.resourceCountIs('AWS::RDS::DBInstance', 2);
    });
  });

  describe('Lambda Functions', () => {
    test('creates 8 Lambda functions', () => {
      template.resourceCountIs('AWS::Lambda::Function', 8);
    });

    test('creates technical scanner Lambda', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'marketsage-technical-scanner',
        Runtime: 'nodejs20.x',
        Timeout: 300,
      });
    });

    test('creates bull agent Lambda', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'marketsage-bull-agent',
        Runtime: 'nodejs20.x',
        MemorySize: 1024,
      });
    });

    test('creates bear agent Lambda', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'marketsage-bear-agent',
        Runtime: 'nodejs20.x',
        MemorySize: 1024,
      });
    });

    test('creates API handler Lambda', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'marketsage-api-handler',
        Runtime: 'nodejs20.x',
      });
    });
  });

  describe('Step Functions', () => {
    test('creates adversarial analysis state machine', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineName: 'marketsage-adversarial-analysis',
      });
    });

    test('creates retro exam state machine', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineName: 'marketsage-retro-exam',
      });
    });
  });

  describe('EventBridge Rules', () => {
    test('creates daily analysis rule', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'marketsage-daily-analysis',
        ScheduleExpression: 'cron(0 0 ? * TUE-SAT *)',
      });
    });

    test('creates daily retro exam rule', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'marketsage-daily-retro-exam',
        ScheduleExpression: 'cron(30 0 ? * TUE-SAT *)',
      });
    });
  });

  describe('API Gateway', () => {
    test('creates REST API', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'MarketSage API',
      });
    });

    test('creates API resources for routes', () => {
      // Check for /reports resource
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'reports',
      });

      // Check for /dates resource
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'dates',
      });

      // Check for /health resource
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'health',
      });
    });
  });

  describe('Amplify', () => {
    test('creates Amplify app', () => {
      template.hasResourceProperties('AWS::Amplify::App', {
        Name: 'marketsage-frontend',
        Platform: 'WEB_COMPUTE',
      });
    });
  });

  describe('Secrets Manager', () => {
    test('creates Aurora credentials secret', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'marketsage/aurora/credentials',
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    test('exports API URL', () => {
      template.hasOutput('ApiUrl', {
        Export: { Name: 'MarketsageApiUrl' },
      });
    });

    test('exports Aurora endpoint', () => {
      template.hasOutput('AuroraClusterEndpoint', {
        Export: { Name: 'MarketsageDbEndpoint' },
      });
    });

    test('exports Step Function ARN', () => {
      template.hasOutput('StepFunctionArn', {
        Export: { Name: 'MarketsageStateMachineArn' },
      });
    });
  });
});
