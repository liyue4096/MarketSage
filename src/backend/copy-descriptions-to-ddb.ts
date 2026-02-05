/**
 * Copy Company Descriptions from Aurora to DynamoDB
 *
 * Reads all company descriptions from russell_1000 table in Aurora
 * and writes them to the marketsage-company-descriptions DynamoDB table.
 *
 * Usage: npx ts-node copy-descriptions-to-ddb.ts
 *
 * Required environment variables:
 * - AWS_REGION (default: us-east-1)
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
  BatchWriteItemCommand,
  WriteRequest,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const DDB_TABLE_NAME = 'marketsage-company-descriptions';
const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit

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

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const command = new ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql,
      includeResultMetadata: true,
    });

    const response = await this.client.send(command);
    const columnNames = response.columnMetadata?.map(col => col.name || '') || [];

    return (response.records || []).map(record => {
      const row: Record<string, unknown> = {};
      record.forEach((field: Field, i: number) => {
        const f = field as unknown as Record<string, unknown>;
        if (f.isNull) row[columnNames[i]] = null;
        else if (f.stringValue !== undefined) row[columnNames[i]] = f.stringValue;
        else if (f.longValue !== undefined) row[columnNames[i]] = Number(f.longValue);
        else if (f.doubleValue !== undefined) row[columnNames[i]] = f.doubleValue;
        else if (f.booleanValue !== undefined) row[columnNames[i]] = f.booleanValue;
        else row[columnNames[i]] = null;
      });
      return row as T;
    });
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

  async batchWrite(items: { ticker: string; description: string; name?: string }[]): Promise<number> {
    let written = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const writeRequests: WriteRequest[] = batch.map(item => ({
        PutRequest: {
          Item: {
            ticker: { S: item.ticker },
            description: { S: item.description },
            ...(item.name && { name: { S: item.name } }),
          },
        },
      }));

      const command = new BatchWriteItemCommand({
        RequestItems: {
          [this.tableName]: writeRequests,
        },
      });

      await this.client.send(command);
      written += batch.length;

      // Log progress every 100 items
      if (written % 100 === 0 || i + BATCH_SIZE >= items.length) {
        console.log(`[DynamoDB] Written ${written}/${items.length} items`);
      }
    }

    return written;
  }
}

// ============================================
// Main Function
// ============================================
interface TickerDescription {
  ticker: string;
  name: string;
  description: string | null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Copy Company Descriptions: Aurora -> DynamoDB');
  console.log('='.repeat(60));

  // Initialize clients
  const aurora = new AuroraClient();
  const dynamo = new DynamoClient(DDB_TABLE_NAME);

  // Fetch all descriptions from Aurora
  console.log('\n[Aurora] Fetching company descriptions from russell_1000...');

  const rows = await aurora.query<TickerDescription>(`
    SELECT ticker, name, description
    FROM russell_1000
    WHERE description IS NOT NULL AND description != ''
    ORDER BY ticker
  `);

  console.log(`[Aurora] Found ${rows.length} tickers with descriptions`);

  if (rows.length === 0) {
    console.log('\nNo descriptions to copy. Run ticker-enricher first.');
    return;
  }

  // Transform and write to DynamoDB
  console.log(`\n[DynamoDB] Writing to table: ${DDB_TABLE_NAME}`);

  const items = rows.map(row => ({
    ticker: row.ticker,
    description: row.description!,
    name: row.name,
  }));

  const startTime = Date.now();
  const written = await dynamo.batchWrite(items);
  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Total items written: ${written}`);
  console.log(`  Time elapsed: ${elapsed.toFixed(1)}s`);
  console.log(`  Rate: ${(written / elapsed).toFixed(1)} items/sec`);
  console.log('='.repeat(60));
}

// Run
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
