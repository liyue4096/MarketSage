/**
 * Data Loader Lambda
 * Fetches market data from Polygon API and loads into Aurora database
 * - Runs database migrations
 * - Fetches all tickers snapshot from Polygon
 * - Writes ticker metadata and price history to database
 */

import { Handler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
// Using RDS Data API instead of pg for cost savings (no VPC/NAT Gateway needed)
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BatchExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  Field,
  TypeHint,
  SqlParameter,
} from '@aws-sdk/client-rds-data';

// ============================================
// RDS Data API Compatibility Layer
// Mimics pg Pool/Client interface for easy migration
// ============================================

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

// Convert positional parameters ($1, $2, etc.) to named parameters (:p0, :p1, etc.)
function convertPositionalToNamed(sql: string): string {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => `:p${index++}`);
}

// Check if string looks like a date (YYYY-MM-DD format)
function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Convert JavaScript value to RDS Data API parameter format
function toSqlParameter(value: unknown, index: number): { name: string; value: Field; typeHint?: TypeHint } {
  const name = `p${index}`;
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }
  if (typeof value === 'string') {
    // Add typeHint for date strings so PostgreSQL handles them correctly
    if (isDateString(value)) {
      return { name, value: { stringValue: value }, typeHint: 'DATE' };
    }
    return { name, value: { stringValue: value } };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { name, value: { longValue: value } };
    }
    return { name, value: { doubleValue: value } };
  }
  if (typeof value === 'boolean') {
    return { name, value: { booleanValue: value } };
  }
  if (Array.isArray(value)) {
    // Convert array to PostgreSQL array string format
    return { name, value: { stringValue: `{${value.join(',')}}` } };
  }
  return { name, value: { stringValue: String(value) } };
}

// Convert RDS Data API Field to JavaScript value
function fromField(field: Field): unknown {
  const f = field as unknown as Record<string, unknown>;
  if (f.isNull) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.longValue !== undefined) return Number(f.longValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  return null;
}

// Data API Client - mimics pg PoolClient
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

    // Handle transaction control statements
    if (trimmedSql === 'BEGIN' || trimmedSql === 'BEGIN TRANSACTION' || trimmedSql === 'START TRANSACTION') {
      const response = await this.rdsClient.send(new BeginTransactionCommand({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
      }));
      this.transactionId = response.transactionId || null;
      return { rows: [], rowCount: 0 };
    }

    if (trimmedSql === 'COMMIT' || trimmedSql === 'COMMIT TRANSACTION') {
      if (this.transactionId) {
        await this.rdsClient.send(new CommitTransactionCommand({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          transactionId: this.transactionId,
        }));
        this.transactionId = null;
      }
      return { rows: [], rowCount: 0 };
    }

    if (trimmedSql === 'ROLLBACK' || trimmedSql === 'ROLLBACK TRANSACTION') {
      if (this.transactionId) {
        await this.rdsClient.send(new RollbackTransactionCommand({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          transactionId: this.transactionId,
        }));
        this.transactionId = null;
      }
      return { rows: [], rowCount: 0 };
    }

    // Regular query execution
    const convertedSql = convertPositionalToNamed(sql);
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));

    const command = new ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: convertedSql,
      parameters: sqlParams,
      includeResultMetadata: true,
      transactionId: this.transactionId || undefined,
    });

    const response = await this.rdsClient.send(command);

    const columnNames = response.columnMetadata?.map((col: { name?: string }) => col.name || '') || [];
    const rows: T[] = (response.records || []).map((record: Field[]) => {
      const row: Record<string, unknown> = {};
      record.forEach((field: Field, index: number) => {
        const columnName = columnNames[index] || `col${index}`;
        row[columnName] = fromField(field);
      });
      return row as T;
    });

    return {
      rows,
      rowCount: response.numberOfRecordsUpdated ?? rows.length,
    };
  }

  release(): void {
    // No-op for Data API - connection management is handled by AWS
  }
}

// Data API Pool - mimics pg Pool
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

  async end(): Promise<void> {
    // No-op for Data API
  }
}

// Pool is now DataApiPool for compatibility with existing code signatures

// Types
interface TickerSnapshot {
  ticker: string;
  todaysChangePerc: number;
  todaysChange: number;
  updated: number;
  day: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
  prevDay: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
}

interface AllTickersSnapshotResponse {
  status: string;
  request_id: string;
  count: number;
  tickers: TickerSnapshot[];
}

interface DataLoaderEvent {
  action: 'migrate' | 'load-snapshot' | 'full' | 'query' | 'query-sma' | 'load-russell-1000' | 'load-nasdaq-100' | 'load-agg' | 'load-russell-agg' | 'load-sma' | 'load-russell-sma';
  tradeDate?: string; // YYYY-MM-DD format, defaults to previous trading day
  tickers?: string[]; // For query action or load-agg action
  russellData?: Array<{ ticker: string; name: string }>; // For load-russell-1000 action
  nasdaqData?: Array<{ ticker: string; name: string; weight: number }>; // For load-nasdaq-100 action
  fromDate?: string; // For load-agg action, YYYY-MM-DD format
  toDate?: string; // For load-agg action, YYYY-MM-DD format
  batchStart?: number; // For load-russell-agg, starting index (0-based)
  batchSize?: number; // For load-russell-agg, number of tickers per batch (default 50)
}

// Polygon Aggregates (Bars) response types
interface AggBar {
  o: number;  // Open price
  h: number;  // High price
  l: number;  // Low price
  c: number;  // Close price
  v: number;  // Volume
  vw: number; // Volume weighted average price
  t: number;  // Unix millisecond timestamp for the start of the aggregate window
  n?: number; // Number of transactions
}

interface AggregatesResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: AggBar[];
  status: string;
  request_id: string;
  count: number;
  next_url?: string;
}

// Polygon SMA response types
interface SMAValue {
  timestamp: number;  // Unix millisecond timestamp
  value: number;      // SMA value
}

interface SMAResponse {
  results: {
    underlying: {
      url: string;
    };
    values: SMAValue[];
  };
  status: string;
  request_id: string;
}

interface PriceRecord {
  trade_date: string;
  ticker: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
  change: number | null;      // Today's change from previous day
  change_pct: number | null;  // Today's change percentage
  // Previous day OHLCV (optional, only from snapshot endpoint)
  prev_o: number | null;
  prev_h: number | null;
  prev_l: number | null;
  prev_c: number | null;
  prev_v: number | null;
  prev_vw: number | null;
}

interface DataLoaderResult {
  success: boolean;
  action: string;
  message: string;
  stats?: {
    tickersProcessed?: number;
    pricesInserted?: number;
    metadataInserted?: number;
  };
  data?: PriceRecord[] | Record<string, unknown>[];
}

// Migration SQL
const MIGRATION_SQL = `
-- Table A: ticker_metadata (The Registry)
CREATE TABLE IF NOT EXISTS ticker_metadata (
    ticker VARCHAR(10) PRIMARY KEY,
    name TEXT NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticker_metadata_sector ON ticker_metadata(sector);

-- Table B: price_history (The Time-Series Core)
CREATE TABLE IF NOT EXISTS price_history (
    trade_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    o NUMERIC(18,4),
    h NUMERIC(18,4),
    l NUMERIC(18,4),
    c NUMERIC(18,4) NOT NULL,
    v BIGINT,
    vw NUMERIC(18,4),
    change NUMERIC(20,10),       -- Today's change from previous day (high precision)
    change_pct NUMERIC(20,10),   -- Today's change percentage (high precision)
    -- Previous day OHLCV (optional, only from snapshot endpoint)
    prev_o NUMERIC(18,4),
    prev_h NUMERIC(18,4),
    prev_l NUMERIC(18,4),
    prev_c NUMERIC(18,4),
    prev_v BIGINT,
    prev_vw NUMERIC(18,4),
    PRIMARY KEY (trade_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (trade_date);

-- Migration: Drop close_price column if it exists (it was redundant with c)
DO $$
BEGIN
    ALTER TABLE price_history DROP COLUMN IF EXISTS close_price;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Alter v column type if table already exists (for migrations)
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN v TYPE BIGINT;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change NUMERIC(20,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Alter change column to high precision
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN change TYPE NUMERIC(20,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change_pct column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change_pct NUMERIC(20,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Alter change_pct column to high precision
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN change_pct TYPE NUMERIC(20,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_o column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_o NUMERIC(18,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_h column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_h NUMERIC(18,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_l column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_l NUMERIC(18,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_c column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_c NUMERIC(18,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_v column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_v BIGINT;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_vw column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_vw NUMERIC(18,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Increase NUMERIC precision to prevent overflow errors
-- Change NUMERIC(12,4) to NUMERIC(18,4) for price columns, NUMERIC(18,10) to NUMERIC(20,10) for change columns
DO $$
DECLARE
    partition_name TEXT;
BEGIN
    -- First, alter the parent table
    ALTER TABLE price_history ALTER COLUMN o TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN h TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN l TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN c TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN vw TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN prev_o TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN prev_h TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN prev_l TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN prev_c TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN prev_vw TYPE NUMERIC(18,4);
    ALTER TABLE price_history ALTER COLUMN change TYPE NUMERIC(20,10);
    ALTER TABLE price_history ALTER COLUMN change_pct TYPE NUMERIC(20,10);

    -- Explicitly alter each partition (2020-2030)
    FOR year IN 2020..2030 LOOP
        partition_name := 'price_history_' || year;
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN o TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN h TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN l TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN c TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN vw TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_o TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_h TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_l TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_c TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_vw TYPE NUMERIC(18,4)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN change TYPE NUMERIC(20,10)', partition_name);
        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN change_pct TYPE NUMERIC(20,10)', partition_name);
    END LOOP;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Create partitions for years 2020-2030
DO $$
BEGIN
    FOR year IN 2020..2030 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS price_history_%s PARTITION OF price_history FOR VALUES FROM (%L) TO (%L)',
            year,
            year || '-01-01',
            (year + 1) || '-01-01'
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker);

-- Table C: russell_1000 (Russell 1000 Index Constituents)
CREATE TABLE IF NOT EXISTS russell_1000 (
    ticker VARCHAR(10) PRIMARY KEY,
    name TEXT NOT NULL
);

-- Table C2: nasdaq_100 (Nasdaq 100 Index Constituents)
CREATE TABLE IF NOT EXISTS nasdaq_100 (
    ticker VARCHAR(10) PRIMARY KEY,
    name TEXT NOT NULL,
    weight NUMERIC(8, 4)  -- Index weight percentage (e.g., 13.60 for 13.60%)
);

-- Table D: sma (Simple Moving Averages)
-- Stores 20-day, 60-day, and 250-day SMA values for each ticker per date
CREATE TABLE IF NOT EXISTS sma (
    trade_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    sma_20 NUMERIC(18,4),   -- 20-day Simple Moving Average
    sma_60 NUMERIC(18,4),   -- 60-day Simple Moving Average
    sma_250 NUMERIC(18,4),  -- 250-day Simple Moving Average
    last_updated TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (trade_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (trade_date);

-- Create partitions for SMA table (years 2020-2030)
DO $$
BEGIN
    FOR year IN 2020..2030 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS sma_%s PARTITION OF sma FOR VALUES FROM (%L) TO (%L)',
            year,
            year || '-01-01',
            (year + 1) || '-01-01'
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sma_ticker ON sma(ticker);

-- Table E: ma_signals (Moving Average Crossover Signals)
-- Stores 20-day, 60-day, and 250-day MA crossover signals for each ticker per date
CREATE TABLE IF NOT EXISTS ma_signals (
    signal_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    ma_20_signal VARCHAR(20),       -- Signal: CROSS_ABOVE, CROSS_BELOW, NONE
    ma_60_signal VARCHAR(20),
    ma_250_signal VARCHAR(20),
    close_price NUMERIC(12, 4),
    sma_20 NUMERIC(12, 4),
    sma_60 NUMERIC(12, 4),
    sma_250 NUMERIC(12, 4),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (signal_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (signal_date);

-- Create partitions for ma_signals table (years 2025-2030)
DO $$
BEGIN
    FOR year IN 2025..2030 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS ma_signals_%s PARTITION OF ma_signals FOR VALUES FROM (%L) TO (%L)',
            year,
            year || '-01-01',
            (year + 1) || '-01-01'
        );
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);
`;

// Get secret from Secrets Manager
async function getSecret(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}

// Get database pool
// Get database pool using RDS Data API (no VPC/NAT Gateway needed)
function getDbPool(): DataApiPool {
  const resourceArn = process.env.DB_CLUSTER_ARN!;
  const secretArn = process.env.DB_SECRET_ARN!;
  const database = process.env.DB_NAME || 'marketsage';

  return new DataApiPool(resourceArn, secretArn, database);
}

// Get Polygon API key
async function getPolygonApiKey(): Promise<string> {
  const secretName = process.env.FINANCIAL_API_KEY_SECRET || 'marketsage/api/polygon';
  const secretStr = await getSecret(secretName);

  // Secret might be JSON or plain string
  try {
    const parsed = JSON.parse(secretStr);
    return parsed.apiKey || parsed.api_key || secretStr;
  } catch {
    return secretStr;
  }
}

// Fetch all tickers snapshot from Polygon
async function fetchAllTickersSnapshot(apiKey: string): Promise<AllTickersSnapshotResponse> {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Fetch aggregates (daily bars) from Polygon for a ticker
async function fetchAggregates(
  apiKey: string,
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<AggregatesResponse> {
  // Using daily timespan (1/day) with adjusted prices
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;

  console.log(`[DataLoader] Fetching aggregates for ${ticker} from ${fromDate} to ${toDate}...`);

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon API error for ${ticker}: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Convert Unix millisecond timestamp to YYYY-MM-DD date string
function unixMsToDateString(unixMs: number): string {
  const date = new Date(unixMs);
  return date.toISOString().split('T')[0];
}

// Fetch SMA (Simple Moving Average) from Polygon for a ticker
async function fetchSMA(
  apiKey: string,
  ticker: string,
  timestamp: string,
  window: number
): Promise<SMAResponse> {
  const url = `https://api.polygon.io/v1/indicators/sma/${ticker}?timestamp=${timestamp}&timespan=day&adjusted=true&window=${window}&series_type=close&order=desc&limit=1&apiKey=${apiKey}`;

  console.log(`[DataLoader] Fetching SMA(${window}) for ${ticker} at ${timestamp}...`);

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon SMA API error for ${ticker}: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Delay helper for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run database migrations
async function runMigrations(pool: DataApiPool): Promise<void> {
  console.log('[DataLoader] Running migrations...');

  const client = await pool.connect();
  try {
    await client.query(MIGRATION_SQL);
    console.log('[DataLoader] Migrations completed successfully');
  } finally {
    client.release();
  }
}

// Process a single batch of price data
async function processPriceBatch(
  pool: DataApiPool,
  batch: TickerSnapshot[],
  tradeDate: string,
  batchIndex: number
): Promise<{ success: boolean; pricesInserted: number; error?: string }> {
  const client = await pool.connect();

  try {
    // Build multi-row INSERT for price_history (20×16=320 params, well under limits)
    const priceValues: string[] = [];
    const priceParams: unknown[] = [];
    batch.forEach((snapshot, idx) => {
      const dayData = snapshot.day?.c ? snapshot.day : snapshot.prevDay;
      const baseIdx = idx * 16;
      priceValues.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14}, $${baseIdx + 15}, $${baseIdx + 16})`);
      priceParams.push(
        tradeDate,
        snapshot.ticker,
        dayData!.o,
        dayData!.h,
        dayData!.l,
        dayData!.c,
        dayData!.v,
        dayData!.vw,
        snapshot.todaysChange ?? null,
        snapshot.todaysChangePerc ?? null,
        snapshot.prevDay?.o ?? null,
        snapshot.prevDay?.h ?? null,
        snapshot.prevDay?.l ?? null,
        snapshot.prevDay?.c ?? null,
        snapshot.prevDay?.v != null ? Math.round(snapshot.prevDay.v) : null,
        snapshot.prevDay?.vw ?? null,
      );
    });

    await client.query(`
      INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,
                                 prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)
      VALUES ${priceValues.join(', ')}
      ON CONFLICT (trade_date, ticker) DO UPDATE SET
        o = EXCLUDED.o, h = EXCLUDED.h, l = EXCLUDED.l, c = EXCLUDED.c,
        v = EXCLUDED.v, vw = EXCLUDED.vw, change = EXCLUDED.change, change_pct = EXCLUDED.change_pct,
        prev_o = EXCLUDED.prev_o, prev_h = EXCLUDED.prev_h, prev_l = EXCLUDED.prev_l,
        prev_c = EXCLUDED.prev_c, prev_v = EXCLUDED.prev_v, prev_vw = EXCLUDED.prev_vw
    `, priceParams);

    return { success: true, pricesInserted: batch.length };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, pricesInserted: 0, error: errorMsg };
  } finally {
    client.release();
  }
}

// Load snapshot data into database using parallel batch INSERTs
// Uses smaller batches (20 rows) with parallel execution (5 concurrent) to maximize throughput
// while avoiding RDS Data API statement timeouts
async function loadSnapshotData(
  pool: DataApiPool,
  snapshots: TickerSnapshot[],
  tradeDate: string
): Promise<{ metadataInserted: number; pricesInserted: number }> {
  console.log(`[DataLoader] Loading ${snapshots.length} tickers for ${tradeDate}...`);

  let metadataInserted = 0;
  let pricesInserted = 0;
  let batchesFailed = 0;
  const failedBatches: number[] = [];

  // Filter valid snapshots first
  const validSnapshots = snapshots.filter(snapshot => {
    const dayData = snapshot.day?.c ? snapshot.day : snapshot.prevDay;
    return dayData && dayData.c !== undefined;
  });

  console.log(`[DataLoader] Found ${validSnapshots.length} valid snapshots`);

  // Step 1: Insert all metadata in larger batches (lighter operation)
  const metadataBatchSize = 100;
  console.log(`[DataLoader] Inserting ticker metadata...`);

  for (let i = 0; i < validSnapshots.length; i += metadataBatchSize) {
    const batch = validSnapshots.slice(i, i + metadataBatchSize);
    const client = await pool.connect();

    try {
      const metadataValues: string[] = [];
      const metadataParams: unknown[] = [];
      batch.forEach((snapshot, idx) => {
        const baseIdx = idx * 2;
        metadataValues.push(`($${baseIdx + 1}, $${baseIdx + 2}, NOW())`);
        metadataParams.push(snapshot.ticker, snapshot.ticker);
      });

      await client.query(`
        INSERT INTO ticker_metadata (ticker, name, last_updated)
        VALUES ${metadataValues.join(', ')}
        ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()
      `, metadataParams);
      metadataInserted += batch.length;
    } catch (error) {
      console.error(`[DataLoader] Metadata batch failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      client.release();
    }
  }
  console.log(`[DataLoader] Inserted ${metadataInserted} metadata records`);

  // Step 2: Insert price data with smaller batches processed in parallel
  // Use batch size of 20 (320 params) to avoid statement timeouts
  // Process 5 batches concurrently for better throughput
  const priceBatchSize = 20;
  const concurrency = 5;

  // Create all batches
  const batches: { batch: TickerSnapshot[]; index: number }[] = [];
  for (let i = 0; i < validSnapshots.length; i += priceBatchSize) {
    batches.push({
      batch: validSnapshots.slice(i, i + priceBatchSize),
      index: Math.floor(i / priceBatchSize)
    });
  }

  console.log(`[DataLoader] Processing ${batches.length} price batches with concurrency ${concurrency}...`);

  // Process batches in parallel with limited concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency);

    const results = await Promise.all(
      concurrentBatches.map(({ batch, index }) =>
        processPriceBatch(pool, batch, tradeDate, index)
      )
    );

    // Tally results
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const batchIndex = concurrentBatches[j].index;

      if (result.success) {
        pricesInserted += result.pricesInserted;
      } else {
        batchesFailed++;
        failedBatches.push(batchIndex);
        console.error(`[DataLoader] Batch ${batchIndex} failed: ${result.error}`);
      }
    }

    // Progress logging every 50 batches (1000 records) or at end
    const processedBatches = Math.min(i + concurrency, batches.length);
    if (processedBatches % 50 === 0 || processedBatches === batches.length) {
      console.log(`[DataLoader] Processed ${processedBatches}/${batches.length} batches, ${pricesInserted} prices inserted (${batchesFailed} failed)`);
    }
  }

  if (batchesFailed > 0) {
    console.warn(`[DataLoader] Completed with ${batchesFailed} failed batches: [${failedBatches.slice(0, 20).join(', ')}${failedBatches.length > 20 ? '...' : ''}]`);
  }
  console.log(`[DataLoader] Successfully loaded ${pricesInserted} price records (${metadataInserted} metadata records)`);

  return { metadataInserted, pricesInserted };
}

// Get current trading day (today in ET)
// Uses US Eastern Time since US markets operate on ET
function getCurrentTradingDay(): string {
  // Get current time in US Eastern Time
  const now = new Date();
  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  return now.toLocaleDateString('en-CA', etOptions); // en-CA gives YYYY-MM-DD format
}

export const handler: Handler<DataLoaderEvent, DataLoaderResult> = async (event) => {
  const action = event.action || 'full';
  const tradeDate = event.tradeDate || getCurrentTradingDay();

  console.log(`[DataLoader] Starting with action: ${action}, tradeDate: ${tradeDate}`);

  let pool: DataApiPool | null = null;

  try {
    pool = await getDbPool();

    if (action === 'migrate' || action === 'full') {
      await runMigrations(pool);

      if (action === 'migrate') {
        return {
          success: true,
          action: 'migrate',
          message: 'Migrations completed successfully',
        };
      }
    }

    if (action === 'load-snapshot' || action === 'full') {
      // Get Polygon API key
      const apiKey = await getPolygonApiKey();

      // Fetch snapshot
      console.log('[DataLoader] Fetching snapshot from Polygon...');
      const snapshot = await fetchAllTickersSnapshot(apiKey);
      console.log(`[DataLoader] Received ${snapshot.count} tickers from Polygon`);

      // Load into database
      const stats = await loadSnapshotData(pool, snapshot.tickers, tradeDate);

      // Verify data
      const [metadataCount] = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM ticker_metadata'
      ).then(r => r.rows);

      const [priceCount] = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM price_history WHERE trade_date = $1',
        [tradeDate]
      ).then(r => r.rows);

      console.log(`[DataLoader] Verification - Metadata: ${metadataCount.count}, Prices for ${tradeDate}: ${priceCount.count}`);

      return {
        success: true,
        action,
        message: `Successfully loaded snapshot data for ${tradeDate}`,
        stats: {
          tickersProcessed: snapshot.count,
          metadataInserted: stats.metadataInserted,
          pricesInserted: stats.pricesInserted,
        },
      };
    }

    if (action === 'query') {
      const tickersToQuery = event.tickers || ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

      const result = await pool.query<PriceRecord>(
        `SELECT trade_date::text, ticker, o::float, h::float, l::float, c::float, v::float, vw::float,
                change::float, change_pct::float,
                prev_o::float, prev_h::float, prev_l::float, prev_c::float, prev_v::float, prev_vw::float
         FROM price_history
         WHERE ticker = ANY($1) AND trade_date = $2
         ORDER BY ticker`,
        [tickersToQuery, tradeDate]
      );

      return {
        success: true,
        action: 'query',
        message: `Retrieved ${result.rows.length} records for ${tradeDate}`,
        data: result.rows,
      };
    }

    if (action === 'query-sma') {
      const tickersToQuery = event.tickers || ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

      const result = await pool.query(
        `SELECT trade_date::text, ticker, sma_20::float, sma_60::float, sma_250::float, last_updated
         FROM sma
         WHERE ticker = ANY($1)
         ORDER BY trade_date DESC, ticker
         LIMIT 100`,
        [tickersToQuery]
      );

      return {
        success: true,
        action: 'query-sma',
        message: `Retrieved ${result.rows.length} SMA records`,
        data: result.rows,
      };
    }

    if (action === 'load-russell-1000') {
      const russellData = event.russellData;

      if (!russellData || russellData.length === 0) {
        return {
          success: false,
          action,
          message: 'russellData is required for load-russell-1000 action',
        };
      }

      console.log(`[DataLoader] Loading ${russellData.length} Russell 1000 tickers...`);

      // Ensure russell_1000 table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS russell_1000 (
          ticker VARCHAR(10) PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);

      // Clear existing data and insert new
      const client = await pool.connect();
      let inserted = 0;

      try {
        await client.query('BEGIN');

        // Truncate existing data
        await client.query('TRUNCATE TABLE russell_1000');

        // Insert all records
        for (const record of russellData) {
          await client.query(
            'INSERT INTO russell_1000 (ticker, name) VALUES ($1, $2)',
            [record.ticker, record.name]
          );
          inserted++;
        }

        await client.query('COMMIT');
        console.log(`[DataLoader] Successfully loaded ${inserted} Russell 1000 tickers`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      // Verify
      const [{ count: russellCount }] = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM russell_1000'
      ).then(r => r.rows);

      console.log(`[DataLoader] Russell 1000 table now has ${russellCount} tickers`);

      return {
        success: true,
        action,
        message: `Successfully loaded ${inserted} Russell 1000 tickers`,
        stats: {
          tickersProcessed: russellData.length,
          metadataInserted: inserted,
        },
      };
    }

    if (action === 'load-nasdaq-100') {
      const nasdaqData = event.nasdaqData;

      if (!nasdaqData || nasdaqData.length === 0) {
        return {
          success: false,
          action,
          message: 'nasdaqData is required for load-nasdaq-100 action',
        };
      }

      console.log(`[DataLoader] Loading ${nasdaqData.length} Nasdaq 100 tickers...`);

      // Ensure nasdaq_100 table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nasdaq_100 (
          ticker VARCHAR(10) PRIMARY KEY,
          name TEXT NOT NULL,
          weight NUMERIC(8, 4)
        )
      `);

      // Clear existing data and insert new
      const client = await pool.connect();
      let inserted = 0;

      try {
        await client.query('BEGIN');

        // Truncate existing data
        await client.query('TRUNCATE TABLE nasdaq_100');

        // Insert all records
        for (const record of nasdaqData) {
          await client.query(
            'INSERT INTO nasdaq_100 (ticker, name, weight) VALUES ($1, $2, $3)',
            [record.ticker, record.name, record.weight]
          );
          inserted++;
        }

        await client.query('COMMIT');
        console.log(`[DataLoader] Successfully loaded ${inserted} Nasdaq 100 tickers`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      // Verify
      const [{ count: nasdaqCount }] = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM nasdaq_100'
      ).then(r => r.rows);

      console.log(`[DataLoader] Nasdaq 100 table now has ${nasdaqCount} tickers`);

      return {
        success: true,
        action,
        message: `Successfully loaded ${inserted} Nasdaq 100 tickers`,
        stats: {
          tickersProcessed: nasdaqData.length,
          metadataInserted: inserted,
        },
      };
    }

    if (action === 'load-agg') {
      const tickersToLoad = event.tickers;
      const fromDate = event.fromDate;
      const toDate = event.toDate;

      if (!tickersToLoad || tickersToLoad.length === 0) {
        return {
          success: false,
          action,
          message: 'tickers is required for load-agg action',
        };
      }

      if (!fromDate || !toDate) {
        return {
          success: false,
          action,
          message: 'fromDate and toDate are required for load-agg action',
        };
      }

      // Get Polygon API key
      const apiKey = await getPolygonApiKey();

      const client = await pool.connect();
      let totalPricesInserted = 0;
      let totalMetadataInserted = 0;

      try {
        await client.query('BEGIN');

        for (const ticker of tickersToLoad) {
          // Ensure ticker exists in metadata
          await client.query(`
            INSERT INTO ticker_metadata (ticker, name, last_updated)
            VALUES ($1, $2, NOW())
            ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()
          `, [ticker, ticker]);
          totalMetadataInserted++;

          // Fetch aggregates from Polygon
          const aggResponse = await fetchAggregates(apiKey, ticker, fromDate, toDate);

          if (!aggResponse.results || aggResponse.results.length === 0) {
            console.log(`[DataLoader] No results for ${ticker}`);
            continue;
          }

          console.log(`[DataLoader] Got ${aggResponse.resultsCount} bars for ${ticker}`);

          // Insert each bar as a price history record
          // Note: Aggregates endpoint doesn't have change/change_pct/prevDay, so we insert NULL
          for (const bar of aggResponse.results) {
            // Convert Unix millisecond timestamp to date string
            const barTradeDate = unixMsToDateString(bar.t);

            await client.query(`
              INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,
                                         prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
              ON CONFLICT (trade_date, ticker) DO UPDATE SET
                o = EXCLUDED.o,
                h = EXCLUDED.h,
                l = EXCLUDED.l,
                c = EXCLUDED.c,
                v = EXCLUDED.v,
                vw = EXCLUDED.vw
            `, [
              barTradeDate,
              ticker,
              bar.o,
              bar.h,
              bar.l,
              bar.c,
              Math.round(bar.v), // Round volume to integer for BIGINT column
              bar.vw,
            ]);
            totalPricesInserted++;
          }

          console.log(`[DataLoader] Inserted ${aggResponse.resultsCount} price records for ${ticker}`);
        }

        await client.query('COMMIT');
        console.log(`[DataLoader] Successfully loaded ${totalPricesInserted} total price records`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        success: true,
        action,
        message: `Successfully loaded aggregates for ${tickersToLoad.length} ticker(s) from ${fromDate} to ${toDate}`,
        stats: {
          tickersProcessed: tickersToLoad.length,
          metadataInserted: totalMetadataInserted,
          pricesInserted: totalPricesInserted,
        },
      };
    }

    if (action === 'load-russell-agg') {
      const fromDate = event.fromDate;
      const toDate = event.toDate;
      const batchStart = event.batchStart ?? 0;
      const batchSize = event.batchSize ?? 50;

      if (!fromDate || !toDate) {
        return {
          success: false,
          action,
          message: 'fromDate and toDate are required for load-russell-agg action',
        };
      }

      // Get all Russell 1000 tickers from database
      const russellResult = await pool.query<{ ticker: string }>(
        'SELECT ticker FROM russell_1000 ORDER BY ticker'
      );
      const allTickers = russellResult.rows.map(r => r.ticker);
      const totalTickers = allTickers.length;

      console.log(`[DataLoader] Found ${totalTickers} Russell 1000 tickers`);

      // Get batch to process
      const tickersToProcess = allTickers.slice(batchStart, batchStart + batchSize);

      if (tickersToProcess.length === 0) {
        return {
          success: true,
          action,
          message: `All ${totalTickers} Russell 1000 tickers have been processed`,
          stats: {
            tickersProcessed: 0,
            pricesInserted: 0,
          },
        };
      }

      console.log(`[DataLoader] Processing batch: tickers ${batchStart} to ${batchStart + tickersToProcess.length - 1} (${tickersToProcess[0]} to ${tickersToProcess[tickersToProcess.length - 1]})`);

      // Get Polygon API key
      const apiKey = await getPolygonApiKey();

      const client = await pool.connect();
      let totalPricesInserted = 0;
      let tickersProcessed = 0;
      let tickersFailed = 0;
      const failedTickers: string[] = [];

      try {
        for (const ticker of tickersToProcess) {
          try {
            // Ensure ticker exists in metadata
            await client.query(`
              INSERT INTO ticker_metadata (ticker, name, last_updated)
              VALUES ($1, $2, NOW())
              ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()
            `, [ticker, ticker]);

            // Fetch aggregates from Polygon
            const aggResponse = await fetchAggregates(apiKey, ticker, fromDate, toDate);

            if (!aggResponse.results || aggResponse.results.length === 0) {
              console.log(`[DataLoader] No results for ${ticker}`);
              tickersProcessed++;
              continue;
            }

            // Insert each bar - commit per ticker to avoid large transactions
            // Note: Aggregates endpoint doesn't have change/change_pct/prevDay, so we insert NULL
            await client.query('BEGIN');

            for (const bar of aggResponse.results) {
              const barTradeDate = unixMsToDateString(bar.t);

              await client.query(`
                INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,
                                           prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
                ON CONFLICT (trade_date, ticker) DO UPDATE SET
                  o = EXCLUDED.o,
                  h = EXCLUDED.h,
                  l = EXCLUDED.l,
                  c = EXCLUDED.c,
                  v = EXCLUDED.v,
                  vw = EXCLUDED.vw
              `, [
                barTradeDate,
                ticker,
                bar.o,
                bar.h,
                bar.l,
                bar.c,
                Math.round(bar.v), // Round volume to integer for BIGINT column
                bar.vw,
              ]);
              totalPricesInserted++;
            }

            await client.query('COMMIT');
            tickersProcessed++;

            console.log(`[DataLoader] ${ticker}: ${aggResponse.resultsCount} bars loaded (${tickersProcessed}/${tickersToProcess.length})`);

            // Rate limiting: 100ms delay between API calls (~10 requests/second)
            await delay(100);

          } catch (tickerError) {
            // Rollback any pending transaction for this ticker
            try {
              await client.query('ROLLBACK');
            } catch {
              // Ignore rollback errors
            }

            tickersFailed++;
            failedTickers.push(ticker);
            console.error(`[DataLoader] Error processing ${ticker}:`, tickerError instanceof Error ? tickerError.message : tickerError);

            // Continue with next ticker instead of failing entire batch
            await delay(500); // Longer delay after error
          }
        }

      } finally {
        client.release();
      }

      const nextBatchStart = batchStart + tickersToProcess.length;
      const hasMore = nextBatchStart < totalTickers;

      return {
        success: true,
        action,
        message: `Batch complete: ${tickersProcessed} tickers processed, ${tickersFailed} failed. ${hasMore ? `Next batch starts at ${nextBatchStart}` : 'All batches complete!'}`,
        stats: {
          tickersProcessed,
          pricesInserted: totalPricesInserted,
        },
        data: hasMore ? [{
          trade_date: '',
          ticker: 'NEXT_BATCH',
          o: nextBatchStart,
          h: totalTickers,
          l: batchSize,
          c: 0,
          v: tickersFailed,
          vw: 0,
          change: null,
          change_pct: null,
          prev_o: null,
          prev_h: null,
          prev_l: null,
          prev_c: null,
          prev_v: null,
          prev_vw: null,
        }] : undefined,
      };
    }

    if (action === 'load-sma') {
      const tickersToLoad = event.tickers;

      if (!tickersToLoad || tickersToLoad.length === 0) {
        return {
          success: false,
          action,
          message: 'tickers is required for load-sma action',
        };
      }

      // Get Polygon API key
      const apiKey = await getPolygonApiKey();

      const client = await pool.connect();
      let smaRecordsInserted = 0;

      try {
        await client.query('BEGIN');

        for (const ticker of tickersToLoad) {
          // Fetch SMA for all three windows (20, 60, 250)
          const [sma20Response, sma60Response, sma250Response] = await Promise.all([
            fetchSMA(apiKey, ticker, tradeDate, 20),
            fetchSMA(apiKey, ticker, tradeDate, 60),
            fetchSMA(apiKey, ticker, tradeDate, 250),
          ]);

          const sma20 = sma20Response.results?.values?.[0]?.value ?? null;
          const sma60 = sma60Response.results?.values?.[0]?.value ?? null;
          const sma250 = sma250Response.results?.values?.[0]?.value ?? null;

          // Get the trade date from response (use sma20 as primary, fall back to input tradeDate)
          const smaTradeDate = sma20Response.results?.values?.[0]?.timestamp
            ? unixMsToDateString(sma20Response.results.values[0].timestamp)
            : tradeDate;

          console.log(`[DataLoader] ${ticker} SMA values: 20=${sma20}, 60=${sma60}, 250=${sma250} for ${smaTradeDate}`);

          // Upsert SMA record
          await client.query(`
            INSERT INTO sma (trade_date, ticker, sma_20, sma_60, sma_250, last_updated)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (trade_date, ticker) DO UPDATE SET
              sma_20 = EXCLUDED.sma_20,
              sma_60 = EXCLUDED.sma_60,
              sma_250 = EXCLUDED.sma_250,
              last_updated = NOW()
          `, [smaTradeDate, ticker, sma20, sma60, sma250]);
          smaRecordsInserted++;

          // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
          await delay(300);
        }

        await client.query('COMMIT');
        console.log(`[DataLoader] Successfully loaded ${smaRecordsInserted} SMA records`);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      return {
        success: true,
        action,
        message: `Successfully loaded SMA data for ${tickersToLoad.length} ticker(s) on ${tradeDate}`,
        stats: {
          tickersProcessed: tickersToLoad.length,
          pricesInserted: smaRecordsInserted,
        },
      };
    }

    if (action === 'load-russell-sma') {
      const batchStart = event.batchStart ?? 0;
      const batchSize = event.batchSize ?? 50;

      // Get all Russell 1000 tickers from database
      const russellResult = await pool.query<{ ticker: string }>(
        'SELECT ticker FROM russell_1000 ORDER BY ticker'
      );
      const allTickers = russellResult.rows.map(r => r.ticker);
      const totalTickers = allTickers.length;

      console.log(`[DataLoader] Found ${totalTickers} Russell 1000 tickers for SMA loading`);

      // Get batch to process
      const tickersToProcess = allTickers.slice(batchStart, batchStart + batchSize);

      if (tickersToProcess.length === 0) {
        return {
          success: true,
          action,
          message: `All ${totalTickers} Russell 1000 tickers have been processed for SMA`,
          stats: {
            tickersProcessed: 0,
            pricesInserted: 0,
          },
        };
      }

      console.log(`[DataLoader] Processing SMA batch: tickers ${batchStart} to ${batchStart + tickersToProcess.length - 1} (${tickersToProcess[0]} to ${tickersToProcess[tickersToProcess.length - 1]})`);

      // Get Polygon API key
      const apiKey = await getPolygonApiKey();

      const client = await pool.connect();
      let smaRecordsInserted = 0;
      let tickersProcessed = 0;
      let tickersFailed = 0;
      const failedTickers: string[] = [];

      try {
        for (const ticker of tickersToProcess) {
          try {
            // Fetch SMA for all three windows (20, 60, 250)
            const [sma20Response, sma60Response, sma250Response] = await Promise.all([
              fetchSMA(apiKey, ticker, tradeDate, 20),
              fetchSMA(apiKey, ticker, tradeDate, 60),
              fetchSMA(apiKey, ticker, tradeDate, 250),
            ]);

            const sma20 = sma20Response.results?.values?.[0]?.value ?? null;
            const sma60 = sma60Response.results?.values?.[0]?.value ?? null;
            const sma250 = sma250Response.results?.values?.[0]?.value ?? null;

            // Get the trade date from response
            const smaTradeDate = sma20Response.results?.values?.[0]?.timestamp
              ? unixMsToDateString(sma20Response.results.values[0].timestamp)
              : tradeDate;

            // Upsert SMA record
            await client.query(`
              INSERT INTO sma (trade_date, ticker, sma_20, sma_60, sma_250, last_updated)
              VALUES ($1, $2, $3, $4, $5, NOW())
              ON CONFLICT (trade_date, ticker) DO UPDATE SET
                sma_20 = EXCLUDED.sma_20,
                sma_60 = EXCLUDED.sma_60,
                sma_250 = EXCLUDED.sma_250,
                last_updated = NOW()
            `, [smaTradeDate, ticker, sma20, sma60, sma250]);
            smaRecordsInserted++;
            tickersProcessed++;

            console.log(`[DataLoader] ${ticker}: SMA(20)=${sma20?.toFixed(2)}, SMA(60)=${sma60?.toFixed(2)}, SMA(250)=${sma250?.toFixed(2)} (${tickersProcessed}/${tickersToProcess.length})`);

            // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
            await delay(300);

          } catch (tickerError) {
            tickersFailed++;
            failedTickers.push(ticker);
            console.error(`[DataLoader] Error processing SMA for ${ticker}:`, tickerError instanceof Error ? tickerError.message : tickerError);

            // Continue with next ticker instead of failing entire batch
            await delay(500); // Longer delay after error
          }
        }

      } finally {
        client.release();
      }

      const nextBatchStart = batchStart + tickersToProcess.length;
      const hasMore = nextBatchStart < totalTickers;

      return {
        success: true,
        action,
        message: `SMA Batch complete: ${tickersProcessed} tickers processed, ${tickersFailed} failed. ${hasMore ? `Next batch starts at ${nextBatchStart}` : 'All batches complete!'}`,
        stats: {
          tickersProcessed,
          pricesInserted: smaRecordsInserted,
        },
        data: hasMore ? [{
          trade_date: '',
          ticker: 'NEXT_BATCH',
          o: nextBatchStart,
          h: totalTickers,
          l: batchSize,
          c: 0,
          v: tickersFailed,
          vw: 0,
          change: null,
          change_pct: null,
          prev_o: null,
          prev_h: null,
          prev_l: null,
          prev_c: null,
          prev_v: null,
          prev_vw: null,
        }] : undefined,
      };
    }

    return {
      success: false,
      action,
      message: `Unknown action: ${action}`,
    };

  } catch (error) {
    console.error('[DataLoader] Error:', error);
    // Throw the error so Step Functions can retry
    // This allows the retry configuration with exponential backoff to work
    throw error;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
};
