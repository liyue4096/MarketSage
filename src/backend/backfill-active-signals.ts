/**
 * Backfill Active Signals Script
 *
 * Updates existing DynamoDB analysis records with the correct activeSignals
 * by querying Aurora's ma_signals table.
 *
 * Usage: npx ts-node backfill-active-signals.ts
 *
 * Required environment variables:
 * - AWS_REGION (default: us-west-2)
 * - DB_CLUSTER_ARN: Aurora cluster ARN
 * - DB_SECRET_ARN: Secrets Manager ARN for DB credentials
 * - DB_NAME: Database name (default: marketsage)
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
} from '@aws-sdk/client-rds-data';
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-west-2';
const DDB_TABLE_NAME = 'marketsage-analysis';

// ============================================
// RDS Data API Client
// ============================================
class AuroraClient {
  private client: RDSDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.client = new RDSDataClient({ region: REGION });
    this.resourceArn = process.env.DB_CLUSTER_ARN!;
    this.secretArn = process.env.DB_SECRET_ARN!;
    this.database = process.env.DB_NAME || 'marketsage';

    if (!this.resourceArn || !this.secretArn) {
      throw new Error('DB_CLUSTER_ARN and DB_SECRET_ARN environment variables are required');
    }
  }

  async getSignals(ticker: string, date: string): Promise<string[]> {
    const command = new ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: `SELECT ma_20_signal, ma_60_signal, ma_250_signal
            FROM ma_signals
            WHERE ticker = :ticker AND signal_date = :date::date`,
      parameters: [
        { name: 'ticker', value: { stringValue: ticker } },
        { name: 'date', value: { stringValue: date } },
      ],
      includeResultMetadata: true,
    });

    const response = await this.client.send(command);

    if (!response.records || response.records.length === 0) {
      return [];
    }

    const record = response.records[0];
    const activeSignals: string[] = [];

    // Check each signal - order matters (250MA first for priority)
    const ma250 = (record[2] as any)?.stringValue;
    const ma60 = (record[1] as any)?.stringValue;
    const ma20 = (record[0] as any)?.stringValue;

    if (ma250 && ma250 !== 'NONE') activeSignals.push('250MA');
    if (ma60 && ma60 !== 'NONE') activeSignals.push('60MA');
    if (ma20 && ma20 !== 'NONE') activeSignals.push('20MA');

    return activeSignals;
  }
}

// ============================================
// DynamoDB Client
// ============================================
class DynamoClient {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string) {
    this.client = new DynamoDBClient({ region: REGION });
    this.tableName = tableName;
  }

  async scanReports(): Promise<Array<{ PK: string; SK: string; ticker: string; triggerDate: string; activeSignals?: string[] }>> {
    const reports: Array<{ PK: string; SK: string; ticker: string; triggerDate: string; activeSignals?: string[] }> = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'entityType = :et',
        ExpressionAttributeValues: {
          ':et': { S: 'ANALYSIS_REPORT' },
        },
        ProjectionExpression: 'PK, SK, ticker, triggerDate, activeSignals',
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      if (result.Items) {
        for (const item of result.Items) {
          const unmarshalled = unmarshall(item);
          reports.push({
            PK: unmarshalled.PK,
            SK: unmarshalled.SK,
            ticker: unmarshalled.ticker,
            triggerDate: unmarshalled.triggerDate,
            activeSignals: unmarshalled.activeSignals,
          });
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return reports;
  }

  async updateActiveSignals(PK: string, SK: string, activeSignals: string[]): Promise<void> {
    await this.client.send(new UpdateItemCommand({
      TableName: this.tableName,
      Key: {
        PK: { S: PK },
        SK: { S: SK },
      },
      UpdateExpression: 'SET activeSignals = :signals',
      ExpressionAttributeValues: {
        ':signals': { L: activeSignals.map(s => ({ S: s })) },
      },
    }));
  }
}

// ============================================
// Main Function
// ============================================
async function main() {
  console.log('='.repeat(60));
  console.log('Backfill Active Signals: Aurora -> DynamoDB');
  console.log('='.repeat(60));

  // Initialize clients
  const aurora = new AuroraClient();
  const dynamo = new DynamoClient(DDB_TABLE_NAME);

  // Scan all reports from DynamoDB
  console.log('\n[DynamoDB] Scanning analysis reports...');
  const reports = await dynamo.scanReports();
  console.log(`[DynamoDB] Found ${reports.length} reports`);

  // Filter reports that need updating (no activeSignals or only 1 signal)
  const needsUpdate = reports.filter(r => !r.activeSignals || r.activeSignals.length <= 1);
  console.log(`[DynamoDB] ${needsUpdate.length} reports need activeSignals update`);

  if (needsUpdate.length === 0) {
    console.log('\nAll reports already have activeSignals. Nothing to do.');
    return;
  }

  // Process each report
  const startTime = Date.now();
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const report of needsUpdate) {
    try {
      // Get signals from Aurora
      const signals = await aurora.getSignals(report.ticker, report.triggerDate);

      if (signals.length === 0) {
        console.log(`[Skip] ${report.ticker}@${report.triggerDate} - No signals found in Aurora`);
        skipped++;
        continue;
      }

      // Update DynamoDB
      await dynamo.updateActiveSignals(report.PK, report.SK, signals);
      updated++;

      console.log(`[Updated] ${report.ticker}@${report.triggerDate}: ${signals.join(', ')}`);
    } catch (error) {
      console.error(`[Error] ${report.ticker}@${report.triggerDate}: ${(error as Error).message}`);
      errors++;
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Total reports scanned: ${reports.length}`);
  console.log(`  Reports needing update: ${needsUpdate.length}`);
  console.log(`  Successfully updated: ${updated}`);
  console.log(`  Skipped (no signals): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time elapsed: ${elapsed.toFixed(1)}s`);
  console.log('='.repeat(60));
}

// Run
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
