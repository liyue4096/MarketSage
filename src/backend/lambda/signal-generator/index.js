"use strict";
/**
 * Signal Generator Lambda
 * Runs daily at 4:30 PM ET (after market close) to:
 * 1. Fetch Russell 1000 tickers from Aurora
 * 2. Detect MA crossover signals (20, 60, 250-day)
 * 3. Store signals in Aurora ma_signals table
 * 4. Return list of tickers with active signals for GAN analysis
 *
 * Signal Detection Logic:
 * - CROSS_ABOVE: Yesterday price < MA, Today price >= MA
 * - CROSS_BELOW: Yesterday price >= MA, Today price < MA
 * - NONE: No crossover
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const pg_1 = require("pg");
// Migration SQL for ma_signals table
const MIGRATION_SQL = `
-- Table: ma_signals (Moving Average Crossover Signals)
CREATE TABLE IF NOT EXISTS ma_signals (
    signal_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    ma_20_signal VARCHAR(20),
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);
`;
// Get secret from Secrets Manager
async function getSecret(secretName) {
    const client = new client_secrets_manager_1.SecretsManagerClient({});
    const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    return response.SecretString || '';
}
// Get database pool
async function getDbPool() {
    const secretName = process.env.DB_SECRET_ARN || 'marketsage/aurora/credentials';
    const secretStr = await getSecret(secretName);
    const secret = JSON.parse(secretStr);
    return new pg_1.Pool({
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
function getCurrentTradingDay() {
    const now = new Date();
    const etOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return now.toLocaleDateString('en-CA', etOptions); // YYYY-MM-DD format
}
// Determine signal type by comparing today vs yesterday
function detectSignal(todayPrice, todayMA, yesterdayPrice, yesterdayMA) {
    // Cannot detect signal if missing data
    if (todayMA === null || yesterdayPrice === null || yesterdayMA === null) {
        return 'NONE';
    }
    const todayAboveMA = todayPrice >= todayMA;
    const yesterdayAboveMA = yesterdayPrice >= yesterdayMA;
    if (!yesterdayAboveMA && todayAboveMA) {
        return 'CROSS_ABOVE';
    }
    else if (yesterdayAboveMA && !todayAboveMA) {
        return 'CROSS_BELOW';
    }
    return 'NONE';
}
// Run migrations
async function runMigrations(pool) {
    console.log('[SignalGenerator] Running migrations...');
    const client = await pool.connect();
    try {
        await client.query(MIGRATION_SQL);
        console.log('[SignalGenerator] Migrations completed successfully');
    }
    finally {
        client.release();
    }
}
// Generate signals for all Russell 1000 tickers
async function generateSignals(pool, tradeDate) {
    console.log(`[SignalGenerator] Generating signals for ${tradeDate}...`);
    const client = await pool.connect();
    try {
        // Query to get today's and yesterday's price + SMA data for all Russell 1000 tickers
        // Uses a CTE to get the two most recent trading days for each ticker
        const query = `
      WITH recent_data AS (
        SELECT
          r.ticker,
          ph.trade_date,
          ph.c as close_price,
          s.sma_20,
          s.sma_60,
          s.sma_250,
          ROW_NUMBER() OVER (PARTITION BY r.ticker ORDER BY ph.trade_date DESC) as rn
        FROM russell_1000 r
        INNER JOIN price_history ph ON r.ticker = ph.ticker
        LEFT JOIN sma s ON r.ticker = s.ticker AND ph.trade_date = s.trade_date
        WHERE ph.trade_date <= $1
      ),
      today_data AS (
        SELECT * FROM recent_data WHERE rn = 1
      ),
      yesterday_data AS (
        SELECT * FROM recent_data WHERE rn = 2
      )
      SELECT
        t.ticker,
        t.trade_date::text as trade_date,
        t.close_price::float,
        y.close_price::float as prev_close_price,
        t.sma_20::float,
        t.sma_60::float,
        t.sma_250::float,
        y.sma_20::float as prev_sma_20,
        y.sma_60::float as prev_sma_60,
        y.sma_250::float as prev_sma_250
      FROM today_data t
      LEFT JOIN yesterday_data y ON t.ticker = y.ticker
      WHERE t.trade_date = $1
      ORDER BY t.ticker
    `;
        const result = await client.query(query, [tradeDate]);
        console.log(`[SignalGenerator] Found ${result.rows.length} tickers with data for ${tradeDate}`);
        if (result.rows.length === 0) {
            return {
                success: true,
                action: 'generate-signals',
                message: `No price data found for ${tradeDate}. Make sure price_history and sma tables are populated.`,
                stats: {
                    tickersProcessed: 0,
                    signalsGenerated: 0,
                    activeSignals: { ma20: 0, ma60: 0, ma250: 0 },
                },
                signals: [],
            };
        }
        // Process each ticker and detect signals
        const signals = [];
        let activeSignals = { ma20: 0, ma60: 0, ma250: 0 };
        await client.query('BEGIN');
        for (const row of result.rows) {
            const tickerData = {
                ticker: row.ticker,
                tradeDate: row.trade_date,
                closePrice: row.close_price,
                prevClosePrice: row.prev_close_price,
                sma20: row.sma_20,
                sma60: row.sma_60,
                sma250: row.sma_250,
                prevSma20: row.prev_sma_20,
                prevSma60: row.prev_sma_60,
                prevSma250: row.prev_sma_250,
            };
            // Detect signals for each MA
            const ma20Signal = detectSignal(tickerData.closePrice, tickerData.sma20, tickerData.prevClosePrice, tickerData.prevSma20);
            const ma60Signal = detectSignal(tickerData.closePrice, tickerData.sma60, tickerData.prevClosePrice, tickerData.prevSma60);
            const ma250Signal = detectSignal(tickerData.closePrice, tickerData.sma250, tickerData.prevClosePrice, tickerData.prevSma250);
            // Count active signals
            if (ma20Signal !== 'NONE')
                activeSignals.ma20++;
            if (ma60Signal !== 'NONE')
                activeSignals.ma60++;
            if (ma250Signal !== 'NONE')
                activeSignals.ma250++;
            const signal = {
                ticker: tickerData.ticker,
                signalDate: tradeDate,
                closePrice: tickerData.closePrice,
                sma20: tickerData.sma20,
                sma60: tickerData.sma60,
                sma250: tickerData.sma250,
                ma20Signal,
                ma60Signal,
                ma250Signal,
            };
            // Insert/update signal in database
            await client.query(`
        INSERT INTO ma_signals (signal_date, ticker, ma_20_signal, ma_60_signal, ma_250_signal,
                                close_price, sma_20, sma_60, sma_250)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (signal_date, ticker) DO UPDATE SET
          ma_20_signal = EXCLUDED.ma_20_signal,
          ma_60_signal = EXCLUDED.ma_60_signal,
          ma_250_signal = EXCLUDED.ma_250_signal,
          close_price = EXCLUDED.close_price,
          sma_20 = EXCLUDED.sma_20,
          sma_60 = EXCLUDED.sma_60,
          sma_250 = EXCLUDED.sma_250,
          created_at = NOW()
      `, [
                tradeDate,
                tickerData.ticker,
                ma20Signal,
                ma60Signal,
                ma250Signal,
                tickerData.closePrice,
                tickerData.sma20,
                tickerData.sma60,
                tickerData.sma250,
            ]);
            // Only include in output if there's an active signal
            if (ma20Signal !== 'NONE' || ma60Signal !== 'NONE' || ma250Signal !== 'NONE') {
                signals.push(signal);
            }
        }
        await client.query('COMMIT');
        console.log(`[SignalGenerator] Generated signals: ${result.rows.length} total, ${signals.length} active`);
        console.log(`[SignalGenerator] Active signals by MA: 20-day=${activeSignals.ma20}, 60-day=${activeSignals.ma60}, 250-day=${activeSignals.ma250}`);
        return {
            success: true,
            action: 'generate-signals',
            message: `Generated signals for ${result.rows.length} tickers on ${tradeDate}`,
            stats: {
                tickersProcessed: result.rows.length,
                signalsGenerated: signals.length,
                activeSignals,
            },
            signals,
        };
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
// Query signals from database
async function querySignals(pool, signalDate, ticker) {
    const client = await pool.connect();
    try {
        let query = `
      SELECT
        signal_date::text,
        ticker,
        ma_20_signal,
        ma_60_signal,
        ma_250_signal,
        close_price::float,
        sma_20::float,
        sma_60::float,
        sma_250::float
      FROM ma_signals
      WHERE signal_date = $1
    `;
        const params = [signalDate];
        if (ticker) {
            query += ` AND ticker = $2`;
            params.push(ticker);
        }
        // Only return active signals (non-NONE)
        query += ` AND (ma_20_signal != 'NONE' OR ma_60_signal != 'NONE' OR ma_250_signal != 'NONE')`;
        query += ` ORDER BY ticker`;
        const result = await client.query(query, params.filter(p => p !== undefined));
        const signals = result.rows.map(row => ({
            ticker: row.ticker,
            signalDate: row.signal_date,
            closePrice: row.close_price,
            sma20: row.sma_20,
            sma60: row.sma_60,
            sma250: row.sma_250,
            ma20Signal: row.ma_20_signal,
            ma60Signal: row.ma_60_signal,
            ma250Signal: row.ma_250_signal,
        }));
        return {
            success: true,
            action: 'query-signals',
            message: `Found ${signals.length} active signals for ${signalDate}${ticker ? ` (${ticker})` : ''}`,
            signals,
        };
    }
    finally {
        client.release();
    }
}
const handler = async (event) => {
    const action = event.action || 'generate-signals';
    const tradeDate = event.tradeDate || getCurrentTradingDay();
    console.log(`[SignalGenerator] Starting with action: ${action}, tradeDate: ${tradeDate}`);
    let pool = null;
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
    }
    catch (error) {
        console.error('[SignalGenerator] Error:', error);
        return {
            success: false,
            action,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    finally {
        if (pool) {
            await pool.end();
        }
    }
};
exports.handler = handler;
