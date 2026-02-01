/**
 * Test Script for RDS Data API
 *
 * Run this to verify RDS Data API works before deploying.
 *
 * Prerequisites:
 * 1. AWS credentials configured (aws configure or environment variables)
 * 2. Set environment variables:
 *    export DB_CLUSTER_ARN="arn:aws:rds:us-west-2:ACCOUNT:cluster:your-cluster"
 *    export DB_SECRET_ARN="arn:aws:secretsmanager:us-west-2:ACCOUNT:secret:marketsage/aurora/credentials-xxxxx"
 *    export DB_NAME="marketsage"
 *    export AWS_REGION="us-west-2"
 *
 * Run:
 *   npx ts-node test-rds-data-api.ts
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data';

async function testRdsDataApi() {
  console.log('=== RDS Data API Test ===\n');

  // Check environment variables
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  const database = process.env.DB_NAME || 'marketsage';
  const region = process.env.AWS_REGION || 'us-west-2';

  if (!resourceArn) {
    console.error('ERROR: DB_CLUSTER_ARN environment variable not set');
    console.log('\nTo get your cluster ARN, run:');
    console.log('  aws rds describe-db-clusters --query "DBClusters[?DBClusterIdentifier==\'your-cluster-name\'].DBClusterArn" --output text');
    process.exit(1);
  }

  if (!secretArn) {
    console.error('ERROR: DB_SECRET_ARN environment variable not set');
    console.log('\nTo get your secret ARN, run:');
    console.log('  aws secretsmanager list-secrets --query "SecretList[?Name==\'marketsage/aurora/credentials\'].ARN" --output text');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Region: ${region}`);
  console.log(`  Cluster ARN: ${resourceArn}`);
  console.log(`  Secret ARN: ${secretArn}`);
  console.log(`  Database: ${database}`);
  console.log('');

  const client = new RDSDataClient({ region });

  try {
    // Test 1: Simple connectivity test
    console.log('Test 1: Basic connectivity (SELECT 1)...');
    const test1 = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: 'SELECT 1 as test',
      includeResultMetadata: true,
    }));
    console.log('  ✓ Connection successful!');
    console.log(`  Result: ${JSON.stringify(test1.records)}\n`);

    // Test 2: Query a table
    console.log('Test 2: Query ticker_metadata table...');
    const test2 = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: 'SELECT COUNT(*) as count FROM ticker_metadata',
      includeResultMetadata: true,
    }));
    const count = test2.records?.[0]?.[0]?.longValue || test2.records?.[0]?.[0]?.stringValue || 0;
    console.log(`  ✓ Query successful!`);
    console.log(`  Ticker count: ${count}\n`);

    // Test 3: Query with parameters (typeHint: 'DATE' needed for PostgreSQL date comparison)
    console.log('Test 3: Query with parameters (ma_signals)...');
    const test3 = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: 'SELECT COUNT(*) as count FROM ma_signals WHERE signal_date >= :date',
      parameters: [
        { name: 'date', value: { stringValue: '2025-01-01' }, typeHint: 'DATE' }
      ],
      includeResultMetadata: true,
    }));
    const signalCount = test3.records?.[0]?.[0]?.longValue || test3.records?.[0]?.[0]?.stringValue || 0;
    console.log(`  ✓ Parameterized query successful!`);
    console.log(`  Signal count since 2025-01-01: ${signalCount}\n`);

    // Test 4: Query with multiple columns
    console.log('Test 4: Query russell_1000 sample...');
    const test4 = await client.send(new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql: 'SELECT ticker, name FROM russell_1000 LIMIT 5',
      includeResultMetadata: true,
    }));
    console.log(`  ✓ Multi-column query successful!`);
    console.log(`  Sample tickers:`);
    test4.records?.forEach(record => {
      const ticker = record[0]?.stringValue;
      const name = record[1]?.stringValue;
      console.log(`    - ${ticker}: ${name}`);
    });
    console.log('');

    console.log('=== All tests passed! ===');
    console.log('\nRDS Data API is working correctly.');
    console.log('You can now deploy the changes with: cdk deploy');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    if ((error as Error).message?.includes('Access Denied')) {
      console.log('\nPossible fixes:');
      console.log('1. Check that your IAM user/role has rds-data:ExecuteStatement permission');
      console.log('2. Check that the secret ARN is correct');
      console.log('3. Check that the cluster has Data API enabled');
    }

    if ((error as Error).message?.includes('Cluster not found')) {
      console.log('\nPossible fixes:');
      console.log('1. Check that the cluster ARN is correct');
      console.log('2. Check that the cluster exists in the specified region');
    }

    process.exit(1);
  }
}

testRdsDataApi();
