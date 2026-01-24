/**
 * Signal Generator Lambda
 * Runs daily at 4:30 PM ET (after market close) to:
 * 1. Fetch Russell 1000 tickers from Aurora where price increased (c > prev_c)
 * 2. Detect MA crossover signals (20, 60, 250-day) for filtered tickers
 * 3. Store ONLY valid signals (CROSS_ABOVE/CROSS_BELOW) in ma_signals table
 * 4. Return list of tickers with active signals for GAN analysis
 *
 * Signal Detection Logic:
 * - CROSS_ABOVE: Yesterday price < MA, Today price >= MA
 * - CROSS_BELOW: Yesterday price >= MA, Today price < MA
 * - Only tickers with price increase AND valid crossover signals are stored
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

// Types
type SignalType = 'CROSS_ABOVE' | 'CROSS_BELOW' | 'NONE';

interface MASignal {
  ticker: string;
  signalDate: string;
  closePrice: number;
  prevClosePrice: number;
  priceChangePercent: number;
  sma20: number | null;
  sma60: number | null;
  sma250: number | null;
  ma20Signal: SignalType;
  ma60Signal: SignalType;
  ma250Signal: SignalType;
  generatedAt: string;
  reportedAt: string | null;
}

interface SignalGeneratorEvent {
  action: 'generate-signals' | 'query-signals' | 'migrate';
  tradeDate?: string;  // YYYY-MM-DD format, defaults to today ET
  signalDate?: string; // For query-signals
  ticker?: string;     // For query-signals (optional filter)
}

interface SignalGeneratorResult {
  success: boolean;
  action: string;
  message: string;
  stats?: {
    tickersProcessed: number;
    signalsGenerated: number;
    activeSignals: {
      ma20: number;
      ma60: number;
      ma250: number;
    };
  };
  signals?: MASignal[];  // Tickers with active signals (non-NONE)
}

// Migration SQL for ma_signals table
const MIGRATION_SQL = `
-- Drop and recreate ma_signals table with new schema
DROP TABLE IF EXISTS ma_signals CASCADE;

-- Table: ma_signals (Moving Average Crossover Signals)
-- Only stores valid signals (CROSS_ABOVE/CROSS_BELOW) for tickers with price increase
CREATE TABLE IF NOT EXISTS ma_signals (
    signal_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    close_price NUMERIC(12, 4) NOT NULL,
    prev_close_price NUMERIC(12, 4) NOT NULL,
    price_change_pct NUMERIC(8, 4) NOT NULL,
    ma_20_signal VARCHAR(20),
    ma_60_signal VARCHAR(20),
    ma_250_signal VARCHAR(20),
    sma_20 NUMERIC(12, 4),
    sma_60 NUMERIC(12, 4),
    sma_250 NUMERIC(12, 4),
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reported_at TIMESTAMP,
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

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_ma_signals_unreported ON ma_signals(signal_date) WHERE reported_at IS NULL;
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

// Run migrations
async function runMigrations(pool: Pool): Promise<void> {
  console.log('[SignalGenerator] Running migrations...');
  const client = await pool.connect();
  try {
    await client.query(MIGRATION_SQL);
    console.log('[SignalGenerator] Migrations completed successfully');
  } finally {
    client.release();
  }
}

// Generate signals for Russell 1000 tickers with price increase and MA crossovers
async function generateSignals(pool: Pool, tradeDate: string): Promise<SignalGeneratorResult> {
  console.log(`[SignalGenerator] Generating signals for ${tradeDate}...`);

  const client = await pool.connect();

  try {
    // Query uses prev_c from price_history (previous day's close) and today's SMA
    // Crossover: prev_c vs today's SMA, c vs today's SMA
    const query = `
      WITH ticker_data AS (
        SELECT
          r.ticker,
          ph.trade_date,
          ph.c AS close_price,
          ph.prev_c AS prev_close_price,
          s.sma_20,
          s.sma_60,
          s.sma_250
        FROM russell_1000 r
        INNER JOIN price_history ph ON r.ticker = ph.ticker
        LEFT JOIN sma s ON r.ticker = s.ticker AND ph.trade_date = s.trade_date
        WHERE ph.trade_date = $1
          AND ph.c > ph.prev_c  -- Only tickers with price increase
      ),
      signals AS (
        SELECT
          ticker,
          trade_date::text,
          close_price::float,
          prev_close_price::float,
          sma_20::float,
          sma_60::float,
          sma_250::float,
          CASE
            WHEN prev_close_price < sma_20 AND close_price >= sma_20 THEN 'CROSS_ABOVE'
            WHEN prev_close_price >= sma_20 AND close_price < sma_20 THEN 'CROSS_BELOW'
            ELSE 'NONE'
          END AS ma_20_signal,
          CASE
            WHEN prev_close_price < sma_60 AND close_price >= sma_60 THEN 'CROSS_ABOVE'
            WHEN prev_close_price >= sma_60 AND close_price < sma_60 THEN 'CROSS_BELOW'
            ELSE 'NONE'
          END AS ma_60_signal,
          CASE
            WHEN prev_close_price < sma_250 AND close_price >= sma_250 THEN 'CROSS_ABOVE'
            WHEN prev_close_price >= sma_250 AND close_price < sma_250 THEN 'CROSS_BELOW'
            ELSE 'NONE'
          END AS ma_250_signal
        FROM ticker_data
      )
      SELECT * FROM signals
      WHERE ma_20_signal != 'NONE'
         OR ma_60_signal != 'NONE'
         OR ma_250_signal != 'NONE'
      ORDER BY ticker
    `;

    const result = await client.query(query, [tradeDate]);
    console.log(`[SignalGenerator] Found ${result.rows.length} tickers with valid crossover signals for ${tradeDate}`);

    if (result.rows.length === 0) {
      return {
        success: true,
        action: 'generate-signals',
        message: `No crossover signals found for ${tradeDate}. Make sure price_history and sma tables are populated.`,
        stats: {
          tickersProcessed: 0,
          signalsGenerated: 0,
          activeSignals: { ma20: 0, ma60: 0, ma250: 0 },
        },
        signals: [],
      };
    }

    // Process each signal and insert into database
    const signals: MASignal[] = [];
    let activeSignals = { ma20: 0, ma60: 0, ma250: 0 };
    const generatedAt = new Date().toISOString();

    await client.query('BEGIN');

    for (const row of result.rows) {
      const ma20Signal = row.ma_20_signal as SignalType;
      const ma60Signal = row.ma_60_signal as SignalType;
      const ma250Signal = row.ma_250_signal as SignalType;

      // Count active signals
      if (ma20Signal !== 'NONE') activeSignals.ma20++;
      if (ma60Signal !== 'NONE') activeSignals.ma60++;
      if (ma250Signal !== 'NONE') activeSignals.ma250++;

      // Calculate price change percentage
      const priceChangePercent = ((row.close_price - row.prev_close_price) / row.prev_close_price) * 100;

      const signal: MASignal = {
        ticker: row.ticker,
        signalDate: tradeDate,
        closePrice: row.close_price,
        prevClosePrice: row.prev_close_price,
        priceChangePercent,
        sma20: row.sma_20,
        sma60: row.sma_60,
        sma250: row.sma_250,
        ma20Signal,
        ma60Signal,
        ma250Signal,
        generatedAt,
        reportedAt: null,
      };

      // Insert valid signal into database
      await client.query(`
        INSERT INTO ma_signals (
          signal_date, ticker, close_price, prev_close_price, price_change_pct,
          ma_20_signal, ma_60_signal, ma_250_signal,
          sma_20, sma_60, sma_250, generated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (signal_date, ticker) DO UPDATE SET
          close_price = EXCLUDED.close_price,
          prev_close_price = EXCLUDED.prev_close_price,
          price_change_pct = EXCLUDED.price_change_pct,
          ma_20_signal = EXCLUDED.ma_20_signal,
          ma_60_signal = EXCLUDED.ma_60_signal,
          ma_250_signal = EXCLUDED.ma_250_signal,
          sma_20 = EXCLUDED.sma_20,
          sma_60 = EXCLUDED.sma_60,
          sma_250 = EXCLUDED.sma_250,
          generated_at = EXCLUDED.generated_at
      `, [
        tradeDate,
        row.ticker,
        row.close_price,
        row.prev_close_price,
        priceChangePercent,
        ma20Signal,
        ma60Signal,
        ma250Signal,
        row.sma_20,
        row.sma_60,
        row.sma_250,
        generatedAt,
      ]);

      signals.push(signal);
    }

    await client.query('COMMIT');

    console.log(`[SignalGenerator] Stored ${signals.length} valid crossover signals`);
    console.log(`[SignalGenerator] Signals by MA: 20-day=${activeSignals.ma20}, 60-day=${activeSignals.ma60}, 250-day=${activeSignals.ma250}`);

    return {
      success: true,
      action: 'generate-signals',
      message: `Generated ${signals.length} crossover signals for ${tradeDate}`,
      stats: {
        tickersProcessed: result.rows.length,
        signalsGenerated: signals.length,
        activeSignals,
      },
      signals,
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Query signals from database
async function querySignals(pool: Pool, signalDate: string, ticker?: string): Promise<SignalGeneratorResult> {
  const client = await pool.connect();

  try {
    let query = `
      SELECT
        signal_date::text,
        ticker,
        close_price::float,
        prev_close_price::float,
        price_change_pct::float,
        ma_20_signal,
        ma_60_signal,
        ma_250_signal,
        sma_20::float,
        sma_60::float,
        sma_250::float,
        generated_at::text,
        reported_at::text
      FROM ma_signals
      WHERE signal_date = $1
    `;
    const params: (string | undefined)[] = [signalDate];

    if (ticker) {
      query += ` AND ticker = $2`;
      params.push(ticker);
    }

    query += ` ORDER BY price_change_pct DESC`;

    const result = await client.query(query, params.filter(p => p !== undefined));

    const signals: MASignal[] = result.rows.map(row => ({
      ticker: row.ticker,
      signalDate: row.signal_date,
      closePrice: row.close_price,
      prevClosePrice: row.prev_close_price,
      priceChangePercent: row.price_change_pct,
      sma20: row.sma_20,
      sma60: row.sma_60,
      sma250: row.sma_250,
      ma20Signal: row.ma_20_signal as SignalType,
      ma60Signal: row.ma_60_signal as SignalType,
      ma250Signal: row.ma_250_signal as SignalType,
      generatedAt: row.generated_at,
      reportedAt: row.reported_at,
    }));

    return {
      success: true,
      action: 'query-signals',
      message: `Found ${signals.length} signals for ${signalDate}${ticker ? ` (${ticker})` : ''}`,
      signals,
    };

  } finally {
    client.release();
  }
}

// Lambda handler
type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

export const handler: Handler<SignalGeneratorEvent, SignalGeneratorResult> = async (event) => {
  const action = event.action || 'generate-signals';
  const tradeDate = event.tradeDate || getCurrentTradingDay();

  console.log(`[SignalGenerator] Starting with action: ${action}, tradeDate: ${tradeDate}`);

  let pool: Pool | null = null;

  try {
    pool = await getDbPool();

    switch (action) {
      case 'migrate':
        await runMigrations(pool);
        return {
          success: true,
          action: 'migrate',
          message: 'Migrations completed successfully',
        };

      case 'generate-signals':
        return await generateSignals(pool, tradeDate);

      case 'query-signals':
        const signalDate = event.signalDate || tradeDate;
        return await querySignals(pool, signalDate, event.ticker);

      default:
        return {
          success: false,
          action,
          message: `Unknown action: ${action}. Valid actions: generate-signals, query-signals, migrate`,
        };
    }

  } catch (error) {
    console.error('[SignalGenerator] Error:', error);
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
