/**
 * Data Loader Lambda
 * Fetches market data from Polygon API and loads into Aurora database
 * - Runs database migrations
 * - Fetches all tickers snapshot from Polygon
 * - Writes ticker metadata and price history to database
 */

import { Handler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

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
  action: 'migrate' | 'load-snapshot' | 'full' | 'query' | 'load-russell-1000' | 'load-agg' | 'load-russell-agg';
  tradeDate?: string; // YYYY-MM-DD format, defaults to previous trading day
  tickers?: string[]; // For query action or load-agg action
  russellData?: Array<{ ticker: string; name: string }>; // For load-russell-1000 action
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
  data?: PriceRecord[];
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
    o NUMERIC(12,4),
    h NUMERIC(12,4),
    l NUMERIC(12,4),
    c NUMERIC(12,4) NOT NULL,
    v BIGINT,
    vw NUMERIC(12,4),
    change NUMERIC(12,4),       -- Today's change from previous day
    change_pct NUMERIC(8,4),    -- Today's change percentage
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
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change_pct column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change_pct NUMERIC(8,4);
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
`;

// Get secret from Secrets Manager
async function getSecret(secretName: string): Promise<string> {
  const client = new SecretsManagerClient({});
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}

// Get database pool
async function getDbPool(): Promise<Pool> {
  const secretName = process.env.DB_SECRET_ARN || 'marketsage/aurora/credentials';
  const secretStr = await getSecret(secretName);
  const secret = JSON.parse(secretStr);

  return new Pool({
    host: secret.host || process.env.DB_CLUSTER_ENDPOINT,
    port: secret.port || 5432,
    database: secret.dbname || process.env.DB_NAME || 'marketsage',
    user: secret.username,
    password: secret.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
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

// Delay helper for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run database migrations
async function runMigrations(pool: Pool): Promise<void> {
  console.log('[DataLoader] Running migrations...');

  const client = await pool.connect();
  try {
    await client.query(MIGRATION_SQL);
    console.log('[DataLoader] Migrations completed successfully');
  } finally {
    client.release();
  }
}

// Load snapshot data into database
async function loadSnapshotData(
  pool: Pool,
  snapshots: TickerSnapshot[],
  tradeDate: string
): Promise<{ metadataInserted: number; pricesInserted: number }> {
  console.log(`[DataLoader] Loading ${snapshots.length} tickers for ${tradeDate}...`);

  const client = await pool.connect();
  let metadataInserted = 0;
  let pricesInserted = 0;

  try {
    await client.query('BEGIN');

    // Process in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);

      for (const snapshot of batch) {
        // Use prevDay if day data is empty (weekend/holiday), otherwise use day
        const dayData = snapshot.day?.c ? snapshot.day : snapshot.prevDay;

        // Skip if no data available
        if (!dayData || dayData.c === undefined) {
          continue;
        }

        // Upsert ticker metadata
        await client.query(`
          INSERT INTO ticker_metadata (ticker, name, last_updated)
          VALUES ($1, $2, NOW())
          ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()
        `, [snapshot.ticker, snapshot.ticker]);
        metadataInserted++;

        // Upsert price history (including change values from snapshot)
        await client.query(`
          INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (trade_date, ticker) DO UPDATE SET
            o = EXCLUDED.o,
            h = EXCLUDED.h,
            l = EXCLUDED.l,
            c = EXCLUDED.c,
            v = EXCLUDED.v,
            vw = EXCLUDED.vw,
            change = EXCLUDED.change,
            change_pct = EXCLUDED.change_pct
        `, [
          tradeDate,
          snapshot.ticker,
          dayData.o,
          dayData.h,
          dayData.l,
          dayData.c,
          dayData.v,
          dayData.vw,
          snapshot.todaysChange ?? null,
          snapshot.todaysChangePerc ?? null,
        ]);
        pricesInserted++;
      }

      console.log(`[DataLoader] Processed ${Math.min(i + batchSize, snapshots.length)}/${snapshots.length} tickers`);
    }

    await client.query('COMMIT');
    console.log(`[DataLoader] Successfully loaded ${pricesInserted} price records`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { metadataInserted, pricesInserted };
}

// Get previous trading day (skip weekends)
function getPreviousTradingDay(): string {
  const now = new Date();
  let date = new Date(now);

  // Go back one day
  date.setDate(date.getDate() - 1);

  // Skip weekends
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }

  return date.toISOString().split('T')[0];
}

export const handler: Handler<DataLoaderEvent, DataLoaderResult> = async (event) => {
  const action = event.action || 'full';
  const tradeDate = event.tradeDate || getPreviousTradingDay();

  console.log(`[DataLoader] Starting with action: ${action}, tradeDate: ${tradeDate}`);

  let pool: Pool | null = null;

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
                change::float, change_pct::float
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
      const [{ count }] = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM russell_1000'
      ).then(r => r.rows);

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
          // Note: Aggregates endpoint doesn't have change/change_pct, so we insert NULL
          for (const bar of aggResponse.results) {
            // Convert Unix millisecond timestamp to date string
            const barTradeDate = unixMsToDateString(bar.t);

            await client.query(`
              INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
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
            // Note: Aggregates endpoint doesn't have change/change_pct, so we insert NULL
            await client.query('BEGIN');

            for (const bar of aggResponse.results) {
              const barTradeDate = unixMsToDateString(bar.t);

              await client.query(`
                INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
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
