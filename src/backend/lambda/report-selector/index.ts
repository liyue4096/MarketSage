/**
 * Report Selector Lambda
 * Selects tickers for daily report generation with quota management.
 *
 * Daily Quota: 8 reports
 * - 4 from Nasdaq 100 (ordered by index weight)
 * - 4 from Russell 1000 excluding Nasdaq 100 (ordered by signal priority)
 *
 * Selection Logic for Russell 1000 (non-Nasdaq):
 * 1. Signal count (3 signals > 2 signals > 1 signal)
 * 2. If same signal count: 250_ma > 60_ma > 20_ma priority
 * 3. If still tied: price_change_pct descending
 *
 * Skip Rule (Top Priority):
 * - If a ticker has had a report in the last 2 weeks, skip it
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
// Using RDS Data API instead of pg for cost savings (no VPC/NAT Gateway needed)
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  Field,
  TypeHint,
} from '@aws-sdk/client-rds-data';

// ============================================
// RDS Data API Compatibility Layer
// ============================================

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

function convertPositionalToNamed(sql: string): string {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => `:p${index++}`);
}

// Check if string looks like a date (YYYY-MM-DD format)
function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toSqlParameter(value: unknown, index: number): { name: string; value: Field; typeHint?: TypeHint } {
  const name = `p${index}`;
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  if (typeof value === 'string') {
    if (isDateString(value)) {
      return { name, value: { stringValue: value }, typeHint: 'DATE' };
    }
    return { name, value: { stringValue: value } };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { name, value: { longValue: value } } : { name, value: { doubleValue: value } };
  }
  if (typeof value === 'boolean') return { name, value: { booleanValue: value } };
  if (Array.isArray(value)) return { name, value: { stringValue: `{${value.join(',')}}` } };
  return { name, value: { stringValue: String(value) } };
}

function fromField(field: Field): unknown {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return Number(field.longValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  return null;
}

class DataApiClient {
  private transactionId: string | null = null;
  private rdsClient: RDSDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor(rdsClient: RDSDataClient, resourceArn: string, secretArn: string, database: string) {
    this.rdsClient = rdsClient;
    this.resourceArn = resourceArn;
    this.secretArn = secretArn;
    this.database = database;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const trimmedSql = sql.trim().toUpperCase();

    if (trimmedSql === 'BEGIN' || trimmedSql.startsWith('BEGIN')) {
      const response = await this.rdsClient.send(new BeginTransactionCommand({
        resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
      }));
      this.transactionId = response.transactionId || null;
      return { rows: [], rowCount: 0 };
    }

    if (trimmedSql === 'COMMIT' || trimmedSql.startsWith('COMMIT')) {
      if (this.transactionId) {
        await this.rdsClient.send(new CommitTransactionCommand({
          resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
        }));
        this.transactionId = null;
      }
      return { rows: [], rowCount: 0 };
    }

    if (trimmedSql === 'ROLLBACK' || trimmedSql.startsWith('ROLLBACK')) {
      if (this.transactionId) {
        await this.rdsClient.send(new RollbackTransactionCommand({
          resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
        }));
        this.transactionId = null;
      }
      return { rows: [], rowCount: 0 };
    }

    const convertedSql = convertPositionalToNamed(sql);
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));

    const response = await this.rdsClient.send(new ExecuteStatementCommand({
      resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
      sql: convertedSql, parameters: sqlParams, includeResultMetadata: true,
      transactionId: this.transactionId || undefined,
    }));

    const columnNames = response.columnMetadata?.map((col: { name?: string }) => col.name || '') || [];
    const rows: T[] = (response.records || []).map((record: Field[]) => {
      const row: Record<string, unknown> = {};
      record.forEach((field: Field, index: number) => {
        row[columnNames[index] || `col${index}`] = fromField(field);
      });
      return row as T;
    });

    return { rows, rowCount: response.numberOfRecordsUpdated ?? rows.length };
  }

  release(): void {}
}

class DataApiPool {
  private rdsClient: RDSDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor(resourceArn: string, secretArn: string, database: string) {
    this.rdsClient = new RDSDataClient({ region: process.env.AWS_REGION || 'us-west-2' });
    this.resourceArn = resourceArn;
    this.secretArn = secretArn;
    this.database = database;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const client = new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database);
    return client.query<T>(sql, params);
  }

  async connect(): Promise<DataApiClient> {
    return new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database);
  }

  async end(): Promise<void> {}
}

// Types
interface SelectedTicker {
  ticker: string;
  name: string;
  source: 'nasdaq_100' | 'russell_1000';
  weight?: number;          // For Nasdaq 100
  signalCount?: number;     // For Russell 1000
  signals?: {
    ma20: string;
    ma60: string;
    ma250: string;
  };
  priceChangePct?: number;
  closePrice?: number;
  triggerType?: '20MA' | '60MA' | '250MA';
}

interface ReportSelectorEvent {
  action: 'select-tickers' | 'get-recent-reports';
  tradeDate?: string;       // YYYY-MM-DD format, defaults to today ET
  nasdaqLimit?: number;     // Default 4
  russellLimit?: number;    // Default 4
  skipDays?: number;        // Days to look back for skip rule (default 14)
}

interface ReportSelectorResult {
  success: boolean;
  action: string;
  message: string;
  tradeDate?: string;
  selectedTickers?: SelectedTicker[];
  stats?: {
    nasdaqCandidates: number;
    russellCandidates: number;
    skippedTickers: string[];
    selectedNasdaq: number;
    selectedRussell: number;
  };
  recentReports?: Array<{ ticker: string; date: string }>;
}

// DynamoDB table name
const ANALYSIS_TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';

// Get secret from Secrets Manager
async function getSecret(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}

// Get database pool using RDS Data API (no VPC/NAT Gateway needed)
function getDbPool(): DataApiPool {
  const resourceArn = process.env.DB_CLUSTER_ARN!;
  const secretArn = process.env.DB_SECRET_ARN!;
  const database = process.env.DB_NAME || 'marketsage';
  return new DataApiPool(resourceArn, secretArn, database);
}

// Get current trading day (today in ET)
function getCurrentTradingDay(): string {
  const now = new Date();
  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  return now.toLocaleDateString('en-CA', etOptions); // YYYY-MM-DD format
}

// Get date N days ago
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  return date.toLocaleDateString('en-CA', etOptions);
}

// Get recently reported tickers from DynamoDB (last N days)
async function getRecentlyReportedTickers(skipDays: number): Promise<Set<string>> {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-west-2',
  });

  const cutoffDate = getDateNDaysAgo(skipDays);
  console.log(`[ReportSelector] Looking for reports since ${cutoffDate}`);

  const recentTickers = new Set<string>();

  // Scan the table for recent reports
  // Note: In production, consider using a GSI with date for more efficient queries
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(new ScanCommand({
      TableName: ANALYSIS_TABLE_NAME,
      FilterExpression: 'triggerDate >= :cutoffDate AND entityType = :entityType',
      ExpressionAttributeValues: {
        ':cutoffDate': { S: cutoffDate },
        ':entityType': { S: 'ANALYSIS_REPORT' },
      },
      ProjectionExpression: 'ticker, triggerDate',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (result.Items) {
      for (const item of result.Items) {
        const unmarshalled = unmarshall(item);
        if (unmarshalled.ticker) {
          recentTickers.add(unmarshalled.ticker);
        }
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`[ReportSelector] Found ${recentTickers.size} tickers with recent reports`);
  return recentTickers;
}

// Select tickers for reports
async function selectTickers(
  pool: DataApiPool,
  tradeDate: string,
  nasdaqLimit: number,
  russellLimit: number,
  skipTickers: Set<string>
): Promise<{ nasdaq: SelectedTicker[]; russell: SelectedTicker[]; stats: any }> {

  const client = await pool.connect();

  try {
    // Convert skip tickers set to array for SQL
    const skipTickersArray = Array.from(skipTickers);
    const skipTickersPlaceholder = skipTickersArray.length > 0
      ? skipTickersArray.map((_, i) => `$${i + 2}`).join(', ')
      : "''"; // Empty placeholder if no tickers to skip

    // Query 1: Nasdaq 100 tickers ordered by weight (highest first)
    // Skip tickers that have been reported recently
    const nasdaqQuery = `
      SELECT
        n.ticker,
        n.name,
        n.weight,
        ph.c AS close_price,
        ph.change_pct AS price_change_pct,
        s.ma_20_signal,
        s.ma_60_signal,
        s.ma_250_signal
      FROM nasdaq_100 n
      LEFT JOIN price_history ph ON n.ticker = ph.ticker AND ph.trade_date = $1
      LEFT JOIN ma_signals s ON n.ticker = s.ticker AND s.signal_date = $1
      WHERE n.ticker NOT IN (${skipTickersPlaceholder})
        AND (s.ma_20_signal IS NOT NULL OR s.ma_60_signal IS NOT NULL OR s.ma_250_signal IS NOT NULL)
        AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')
      ORDER BY n.weight DESC
      LIMIT $${skipTickersArray.length + 2}
    `;

    const nasdaqParams = [tradeDate, ...skipTickersArray, nasdaqLimit];
    console.log(`[ReportSelector] Querying Nasdaq 100 with limit ${nasdaqLimit}`);
    const nasdaqResult = await client.query(nasdaqQuery, nasdaqParams);
    console.log(`[ReportSelector] Found ${nasdaqResult.rows.length} Nasdaq candidates`);

    // Query 2: Russell 1000 (excluding Nasdaq 100) with signals
    // Ordered by: signal count DESC, 250_ma priority, 60_ma priority, 20_ma priority, price_change_pct DESC
    const russellQuery = `
      WITH signal_data AS (
        SELECT
          r.ticker,
          r.name,
          s.close_price,
          s.price_change_pct,
          s.ma_20_signal,
          s.ma_60_signal,
          s.ma_250_signal,
          -- Count non-NONE signals
          (CASE WHEN s.ma_20_signal != 'NONE' THEN 1 ELSE 0 END) +
          (CASE WHEN s.ma_60_signal != 'NONE' THEN 1 ELSE 0 END) +
          (CASE WHEN s.ma_250_signal != 'NONE' THEN 1 ELSE 0 END) AS signal_count,
          -- Priority flags for ordering
          CASE WHEN s.ma_250_signal != 'NONE' THEN 1 ELSE 0 END AS has_250_signal,
          CASE WHEN s.ma_60_signal != 'NONE' THEN 1 ELSE 0 END AS has_60_signal,
          CASE WHEN s.ma_20_signal != 'NONE' THEN 1 ELSE 0 END AS has_20_signal
        FROM russell_1000 r
        INNER JOIN ma_signals s ON r.ticker = s.ticker AND s.signal_date = $1
        WHERE r.ticker NOT IN (SELECT ticker FROM nasdaq_100)
          AND r.ticker NOT IN (${skipTickersPlaceholder})
          AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')
      )
      SELECT *
      FROM signal_data
      ORDER BY
        signal_count DESC,
        has_250_signal DESC,
        has_60_signal DESC,
        has_20_signal DESC,
        price_change_pct DESC
      LIMIT $${skipTickersArray.length + 2}
    `;

    const russellParams = [tradeDate, ...skipTickersArray, russellLimit];
    console.log(`[ReportSelector] Querying Russell 1000 (non-Nasdaq) with limit ${russellLimit}`);
    const russellResult = await client.query(russellQuery, russellParams);
    console.log(`[ReportSelector] Found ${russellResult.rows.length} Russell candidates`);

    // Transform results
    const nasdaqTickers: SelectedTicker[] = nasdaqResult.rows.map(row => {
      // Determine trigger type based on signals (prioritize 250 > 60 > 20)
      let triggerType: '20MA' | '60MA' | '250MA' = '20MA';
      if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
        triggerType = '250MA';
      } else if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
        triggerType = '60MA';
      }

      return {
        ticker: row.ticker,
        name: row.name,
        source: 'nasdaq_100' as const,
        weight: parseFloat(row.weight),
        closePrice: row.close_price ? parseFloat(row.close_price) : undefined,
        priceChangePct: row.price_change_pct ? parseFloat(row.price_change_pct) : undefined,
        signals: {
          ma20: row.ma_20_signal || 'NONE',
          ma60: row.ma_60_signal || 'NONE',
          ma250: row.ma_250_signal || 'NONE',
        },
        triggerType,
      };
    });

    const russellTickers: SelectedTicker[] = russellResult.rows.map(row => {
      // Determine trigger type based on signals (prioritize 250 > 60 > 20)
      let triggerType: '20MA' | '60MA' | '250MA' = '20MA';
      if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
        triggerType = '250MA';
      } else if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
        triggerType = '60MA';
      }

      return {
        ticker: row.ticker,
        name: row.name,
        source: 'russell_1000' as const,
        signalCount: parseInt(row.signal_count),
        closePrice: row.close_price ? parseFloat(row.close_price) : undefined,
        priceChangePct: row.price_change_pct ? parseFloat(row.price_change_pct) : undefined,
        signals: {
          ma20: row.ma_20_signal || 'NONE',
          ma60: row.ma_60_signal || 'NONE',
          ma250: row.ma_250_signal || 'NONE',
        },
        triggerType,
      };
    });

    // Get total candidate counts (without limits) for stats
    const nasdaqCountQuery = `
      SELECT COUNT(*) as count
      FROM nasdaq_100 n
      LEFT JOIN ma_signals s ON n.ticker = s.ticker AND s.signal_date = $1
      WHERE (s.ma_20_signal IS NOT NULL AND s.ma_20_signal != 'NONE')
         OR (s.ma_60_signal IS NOT NULL AND s.ma_60_signal != 'NONE')
         OR (s.ma_250_signal IS NOT NULL AND s.ma_250_signal != 'NONE')
    `;
    const nasdaqCountResult = await client.query(nasdaqCountQuery, [tradeDate]);

    const russellCountQuery = `
      SELECT COUNT(*) as count
      FROM russell_1000 r
      INNER JOIN ma_signals s ON r.ticker = s.ticker AND s.signal_date = $1
      WHERE r.ticker NOT IN (SELECT ticker FROM nasdaq_100)
        AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')
    `;
    const russellCountResult = await client.query(russellCountQuery, [tradeDate]);

    return {
      nasdaq: nasdaqTickers,
      russell: russellTickers,
      stats: {
        nasdaqCandidates: parseInt(nasdaqCountResult.rows[0].count),
        russellCandidates: parseInt(russellCountResult.rows[0].count),
        skippedTickers: skipTickersArray,
        selectedNasdaq: nasdaqTickers.length,
        selectedRussell: russellTickers.length,
      },
    };

  } finally {
    client.release();
  }
}

// Lambda handler
type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

export const handler: Handler<ReportSelectorEvent, ReportSelectorResult> = async (event) => {
  const action = event.action || 'select-tickers';
  const tradeDate = event.tradeDate || getCurrentTradingDay();
  const nasdaqLimit = event.nasdaqLimit !== undefined ? event.nasdaqLimit : 4;
  const russellLimit = event.russellLimit !== undefined ? event.russellLimit : 4;
  const skipDays = event.skipDays !== undefined ? event.skipDays : 14;

  console.log(`[ReportSelector] Starting with action: ${action}, tradeDate: ${tradeDate}`);
  console.log(`[ReportSelector] Limits: nasdaq=${nasdaqLimit}, russell=${russellLimit}, skipDays=${skipDays}`);

  let pool: DataApiPool | null = null;

  try {
    if (action === 'get-recent-reports') {
      // Just return recent reports without selecting tickers
      const recentTickers = await getRecentlyReportedTickers(skipDays);
      return {
        success: true,
        action,
        message: `Found ${recentTickers.size} tickers with reports in the last ${skipDays} days`,
        recentReports: Array.from(recentTickers).map(ticker => ({ ticker, date: 'within last ' + skipDays + ' days' })),
      };
    }

    if (action === 'select-tickers') {
      // Step 1: Get recently reported tickers (to skip)
      const skipTickers = await getRecentlyReportedTickers(skipDays);

      // Step 2: Connect to database
      pool = await getDbPool();

      // Step 3: Select tickers
      const { nasdaq, russell, stats } = await selectTickers(
        pool,
        tradeDate,
        nasdaqLimit,
        russellLimit,
        skipTickers
      );

      // Combine results
      const selectedTickers = [...nasdaq, ...russell];

      console.log(`[ReportSelector] Selected ${selectedTickers.length} tickers total`);
      console.log(`[ReportSelector] Nasdaq: ${nasdaq.map(t => t.ticker).join(', ')}`);
      console.log(`[ReportSelector] Russell: ${russell.map(t => t.ticker).join(', ')}`);

      return {
        success: true,
        action,
        message: `Selected ${selectedTickers.length} tickers for reports (${nasdaq.length} Nasdaq, ${russell.length} Russell)`,
        tradeDate,
        selectedTickers,
        stats,
      };
    }

    return {
      success: false,
      action,
      message: `Unknown action: ${action}. Valid actions: select-tickers, get-recent-reports`,
    };

  } catch (error) {
    console.error('[ReportSelector] Error:', error);
    return {
      success: false,
      action,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
};
