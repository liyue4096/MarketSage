"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
// Using RDS Data API instead of pg for cost savings (no VPC/NAT Gateway needed)
const client_rds_data_1 = require("@aws-sdk/client-rds-data");
function convertPositionalToNamed(sql) {
    return sql.replace(/\$(\d+)/g, (_match, num) => `:p${parseInt(num) - 1}`);
}
// Check if string looks like a date (YYYY-MM-DD format)
function isDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function toSqlParameter(value, index) {
    const name = `p${index}`;
    if (value === null || value === undefined)
        return { name, value: { isNull: true } };
    if (typeof value === 'string') {
        if (isDateString(value)) {
            return { name, value: { stringValue: value }, typeHint: 'DATE' };
        }
        return { name, value: { stringValue: value } };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { name, value: { longValue: value } } : { name, value: { doubleValue: value } };
    }
    if (typeof value === 'boolean')
        return { name, value: { booleanValue: value } };
    if (Array.isArray(value))
        return { name, value: { stringValue: `{${value.join(',')}}` } };
    return { name, value: { stringValue: String(value) } };
}
function fromField(field) {
    if (field.isNull)
        return null;
    if (field.stringValue !== undefined)
        return field.stringValue;
    if (field.longValue !== undefined)
        return Number(field.longValue);
    if (field.doubleValue !== undefined)
        return field.doubleValue;
    if (field.booleanValue !== undefined)
        return field.booleanValue;
    return null;
}
class DataApiClient {
    constructor(rdsClient, resourceArn, secretArn, database) {
        this.transactionId = null;
        this.rdsClient = rdsClient;
        this.resourceArn = resourceArn;
        this.secretArn = secretArn;
        this.database = database;
    }
    async query(sql, params) {
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql === 'BEGIN' || trimmedSql.startsWith('BEGIN')) {
            const response = await this.rdsClient.send(new client_rds_data_1.BeginTransactionCommand({
                resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
            }));
            this.transactionId = response.transactionId || null;
            return { rows: [], rowCount: 0 };
        }
        if (trimmedSql === 'COMMIT' || trimmedSql.startsWith('COMMIT')) {
            if (this.transactionId) {
                await this.rdsClient.send(new client_rds_data_1.CommitTransactionCommand({
                    resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
                }));
                this.transactionId = null;
            }
            return { rows: [], rowCount: 0 };
        }
        if (trimmedSql === 'ROLLBACK' || trimmedSql.startsWith('ROLLBACK')) {
            if (this.transactionId) {
                await this.rdsClient.send(new client_rds_data_1.RollbackTransactionCommand({
                    resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
                }));
                this.transactionId = null;
            }
            return { rows: [], rowCount: 0 };
        }
        const convertedSql = convertPositionalToNamed(sql);
        const sqlParams = params?.map((value, index) => toSqlParameter(value, index));
        const response = await this.rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
            resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
            sql: convertedSql, parameters: sqlParams, includeResultMetadata: true,
            transactionId: this.transactionId || undefined,
        }));
        const columnNames = response.columnMetadata?.map((col) => col.name || '') || [];
        const rows = (response.records || []).map((record) => {
            const row = {};
            record.forEach((field, index) => {
                row[columnNames[index] || `col${index}`] = fromField(field);
            });
            return row;
        });
        return { rows, rowCount: response.numberOfRecordsUpdated ?? rows.length };
    }
    release() { }
}
class DataApiPool {
    constructor(resourceArn, secretArn, database) {
        this.rdsClient = new client_rds_data_1.RDSDataClient({ region: process.env.AWS_REGION || 'us-west-2' });
        this.resourceArn = resourceArn;
        this.secretArn = secretArn;
        this.database = database;
    }
    async query(sql, params) {
        const client = new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database);
        return client.query(sql, params);
    }
    async connect() {
        return new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database);
    }
    async end() { }
}
// DynamoDB table name
const ANALYSIS_TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';
// Get secret from Secrets Manager
async function getSecret(secretName) {
    const client = new client_secrets_manager_1.SecretsManagerClient({});
    const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    return response.SecretString || '';
}
// Get database pool using RDS Data API (no VPC/NAT Gateway needed)
function getDbPool() {
    const resourceArn = process.env.DB_CLUSTER_ARN;
    const secretArn = process.env.DB_SECRET_ARN;
    const database = process.env.DB_NAME || 'marketsage';
    return new DataApiPool(resourceArn, secretArn, database);
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
// Get date N days ago
function getDateNDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const etOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return date.toLocaleDateString('en-CA', etOptions);
}
// Get recently reported tickers from DynamoDB (last N days)
async function getRecentlyReportedTickers(skipDays) {
    const client = new client_dynamodb_1.DynamoDBClient({
        region: process.env.AWS_REGION || 'us-west-2',
    });
    const cutoffDate = getDateNDaysAgo(skipDays);
    console.log(`[ReportSelector] Looking for reports since ${cutoffDate}`);
    const recentTickers = new Set();
    // Scan the table for recent reports
    // Note: In production, consider using a GSI with date for more efficient queries
    let lastEvaluatedKey;
    do {
        const result = await client.send(new client_dynamodb_1.ScanCommand({
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
                const unmarshalled = (0, util_dynamodb_1.unmarshall)(item);
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
async function selectTickers(pool, tradeDate, nasdaqLimit, russellLimit, skipTickers) {
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
        const nasdaqTickers = nasdaqResult.rows.map(row => {
            // Collect ALL active signals (not just highest priority)
            const activeSignals = [];
            if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
                activeSignals.push('250MA');
            }
            if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
                activeSignals.push('60MA');
            }
            if (row.ma_20_signal && row.ma_20_signal !== 'NONE') {
                activeSignals.push('20MA');
            }
            // For backwards compatibility, triggerType is the highest priority signal
            const triggerType = activeSignals[0] || '20MA';
            return {
                ticker: row.ticker,
                name: row.name,
                source: 'nasdaq_100',
                weight: parseFloat(row.weight),
                closePrice: row.close_price ? parseFloat(row.close_price) : undefined,
                priceChangePct: row.price_change_pct ? parseFloat(row.price_change_pct) : undefined,
                signals: {
                    ma20: row.ma_20_signal || 'NONE',
                    ma60: row.ma_60_signal || 'NONE',
                    ma250: row.ma_250_signal || 'NONE',
                },
                triggerType,
                activeSignals, // New field with all active signals
            };
        });
        const russellTickers = russellResult.rows.map(row => {
            // Collect ALL active signals (not just highest priority)
            const activeSignals = [];
            if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
                activeSignals.push('250MA');
            }
            if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
                activeSignals.push('60MA');
            }
            if (row.ma_20_signal && row.ma_20_signal !== 'NONE') {
                activeSignals.push('20MA');
            }
            // For backwards compatibility, triggerType is the highest priority signal
            const triggerType = activeSignals[0] || '20MA';
            return {
                ticker: row.ticker,
                name: row.name,
                source: 'russell_1000',
                signalCount: parseInt(row.signal_count),
                closePrice: row.close_price ? parseFloat(row.close_price) : undefined,
                priceChangePct: row.price_change_pct ? parseFloat(row.price_change_pct) : undefined,
                signals: {
                    ma20: row.ma_20_signal || 'NONE',
                    ma60: row.ma_60_signal || 'NONE',
                    ma250: row.ma_250_signal || 'NONE',
                },
                triggerType,
                activeSignals, // New field with all active signals
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
    }
    finally {
        client.release();
    }
}
// Database warm-up function
// Aurora Serverless v2 with minCapacity=0 can pause when idle
// This function wakes up the database before running main queries
async function warmupDatabase(pool) {
    const maxRetries = 3;
    const baseDelay = 5000; // 5 seconds
    console.log('[ReportSelector] Warming up database (Aurora may be paused)...');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const client = await pool.connect();
            try {
                const startTime = Date.now();
                await client.query('SELECT 1 as warmup');
                const duration = Date.now() - startTime;
                console.log(`[ReportSelector] Database warm-up successful (took ${duration}ms)`);
                return;
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            const isLastAttempt = attempt === maxRetries;
            if (isLastAttempt) {
                console.error('[ReportSelector] Database warm-up failed after all retries:', error);
                throw error;
            }
            const delay = baseDelay * attempt; // Exponential backoff: 5s, 10s, 15s
            console.log(`[ReportSelector] Warm-up attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
const handler = async (event) => {
    const action = event.action || 'select-tickers';
    console.log('[ReportSelector] Received event:', JSON.stringify(event));
    console.log('[ReportSelector] event.tradeDate =', event.tradeDate);
    const tradeDate = event.tradeDate || getCurrentTradingDay();
    const nasdaqLimit = event.nasdaqLimit !== undefined ? event.nasdaqLimit : 4;
    const russellLimit = event.russellLimit !== undefined ? event.russellLimit : 4;
    const skipDays = event.skipDays !== undefined ? event.skipDays : 14;
    console.log(`[ReportSelector] Starting with action: ${action}, tradeDate: ${tradeDate}`);
    console.log(`[ReportSelector] Using tradeDate: ${tradeDate} (from event.tradeDate: ${event.tradeDate} or current: ${getCurrentTradingDay()})`);
    console.log(`[ReportSelector] Limits: nasdaq=${nasdaqLimit}, russell=${russellLimit}, skipDays=${skipDays}`);
    let pool = null;
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
            // Step 2.5: Warm up database (Aurora Serverless v2 may be paused)
            await warmupDatabase(pool);
            // Step 3: Select tickers
            const { nasdaq, russell, stats } = await selectTickers(pool, tradeDate, nasdaqLimit, russellLimit, skipTickers);
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
    }
    catch (error) {
        console.error('[ReportSelector] Error:', error);
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
