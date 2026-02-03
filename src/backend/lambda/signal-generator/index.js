"use strict";
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
var client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
// Using RDS Data API instead of pg for cost savings (no VPC/NAT Gateway needed)
var client_rds_data_1 = require("@aws-sdk/client-rds-data");
function convertPositionalToNamed(sql) {
    var index = 0;
    return sql.replace(/\$(\d+)/g, function () { return ":p".concat(index++); });
}
// Check if string looks like a date (YYYY-MM-DD format)
function isDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function toSqlParameter(value, index) {
    var name = "p".concat(index);
    if (value === null || value === undefined)
        return { name: name, value: { isNull: true } };
    if (typeof value === 'string') {
        if (isDateString(value)) {
            return { name: name, value: { stringValue: value }, typeHint: 'DATE' };
        }
        return { name: name, value: { stringValue: value } };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { name: name, value: { longValue: value } } : { name: name, value: { doubleValue: value } };
    }
    if (typeof value === 'boolean')
        return { name: name, value: { booleanValue: value } };
    if (Array.isArray(value))
        return { name: name, value: { stringValue: "{".concat(value.join(','), "}") } };
    return { name: name, value: { stringValue: String(value) } };
}
function fromField(field) {
    var f = field;
    if (f.isNull)
        return null;
    if (f.stringValue !== undefined)
        return f.stringValue;
    if (f.longValue !== undefined)
        return Number(f.longValue);
    if (f.doubleValue !== undefined)
        return f.doubleValue;
    if (f.booleanValue !== undefined)
        return f.booleanValue;
    return null;
}
var DataApiClient = /** @class */ (function () {
    function DataApiClient(rdsClient, resourceArn, secretArn, database) {
        this.transactionId = null;
        this.rdsClient = rdsClient;
        this.resourceArn = resourceArn;
        this.secretArn = secretArn;
        this.database = database;
    }
    DataApiClient.prototype.query = function (sql, params) {
        return __awaiter(this, void 0, void 0, function () {
            var trimmedSql, response_1, convertedSql, sqlParams, response, columnNames, rows;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        trimmedSql = sql.trim().toUpperCase();
                        if (!(trimmedSql === 'BEGIN' || trimmedSql.startsWith('BEGIN'))) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.rdsClient.send(new client_rds_data_1.BeginTransactionCommand({
                                resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
                            }))];
                    case 1:
                        response_1 = _c.sent();
                        this.transactionId = response_1.transactionId || null;
                        return [2 /*return*/, { rows: [], rowCount: 0 }];
                    case 2:
                        if (!(trimmedSql === 'COMMIT' || trimmedSql.startsWith('COMMIT'))) return [3 /*break*/, 5];
                        if (!this.transactionId) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.rdsClient.send(new client_rds_data_1.CommitTransactionCommand({
                                resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
                            }))];
                    case 3:
                        _c.sent();
                        this.transactionId = null;
                        _c.label = 4;
                    case 4: return [2 /*return*/, { rows: [], rowCount: 0 }];
                    case 5:
                        if (!(trimmedSql === 'ROLLBACK' || trimmedSql.startsWith('ROLLBACK'))) return [3 /*break*/, 8];
                        if (!this.transactionId) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.rdsClient.send(new client_rds_data_1.RollbackTransactionCommand({
                                resourceArn: this.resourceArn, secretArn: this.secretArn, transactionId: this.transactionId,
                            }))];
                    case 6:
                        _c.sent();
                        this.transactionId = null;
                        _c.label = 7;
                    case 7: return [2 /*return*/, { rows: [], rowCount: 0 }];
                    case 8:
                        convertedSql = convertPositionalToNamed(sql);
                        sqlParams = params === null || params === void 0 ? void 0 : params.map(function (value, index) { return toSqlParameter(value, index); });
                        return [4 /*yield*/, this.rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
                                resourceArn: this.resourceArn, secretArn: this.secretArn, database: this.database,
                                sql: convertedSql, parameters: sqlParams, includeResultMetadata: true,
                                transactionId: this.transactionId || undefined,
                            }))];
                    case 9:
                        response = _c.sent();
                        columnNames = ((_a = response.columnMetadata) === null || _a === void 0 ? void 0 : _a.map(function (col) { return col.name || ''; })) || [];
                        rows = (response.records || []).map(function (record) {
                            var row = {};
                            record.forEach(function (field, index) {
                                row[columnNames[index] || "col".concat(index)] = fromField(field);
                            });
                            return row;
                        });
                        return [2 /*return*/, { rows: rows, rowCount: (_b = response.numberOfRecordsUpdated) !== null && _b !== void 0 ? _b : rows.length }];
                }
            });
        });
    };
    DataApiClient.prototype.release = function () { };
    return DataApiClient;
}());
var DataApiPool = /** @class */ (function () {
    function DataApiPool(resourceArn, secretArn, database) {
        this.rdsClient = new client_rds_data_1.RDSDataClient({ region: process.env.AWS_REGION || 'us-west-2' });
        this.resourceArn = resourceArn;
        this.secretArn = secretArn;
        this.database = database;
    }
    DataApiPool.prototype.query = function (sql, params) {
        return __awaiter(this, void 0, void 0, function () {
            var client;
            return __generator(this, function (_a) {
                client = new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database);
                return [2 /*return*/, client.query(sql, params)];
            });
        });
    };
    DataApiPool.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new DataApiClient(this.rdsClient, this.resourceArn, this.secretArn, this.database)];
            });
        });
    };
    DataApiPool.prototype.end = function () {
        return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); });
    };
    return DataApiPool;
}());
// Migration SQL for ma_signals table
var MIGRATION_SQL = "\n-- Drop and recreate ma_signals table with new schema\nDROP TABLE IF EXISTS ma_signals CASCADE;\n\n-- Table: ma_signals (Moving Average Crossover Signals)\n-- Only stores valid signals (CROSS_ABOVE/CROSS_BELOW) for tickers with price increase\nCREATE TABLE IF NOT EXISTS ma_signals (\n    signal_date DATE NOT NULL,\n    ticker VARCHAR(10) NOT NULL,\n    close_price NUMERIC(12, 4) NOT NULL,\n    prev_close_price NUMERIC(12, 4) NOT NULL,\n    price_change_pct NUMERIC(8, 4) NOT NULL,\n    ma_20_signal VARCHAR(20),\n    ma_60_signal VARCHAR(20),\n    ma_250_signal VARCHAR(20),\n    sma_20 NUMERIC(12, 4),\n    sma_60 NUMERIC(12, 4),\n    sma_250 NUMERIC(12, 4),\n    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),\n    reported_at TIMESTAMP,\n    PRIMARY KEY (signal_date, ticker),\n    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)\n) PARTITION BY RANGE (signal_date);\n\n-- Create partitions for ma_signals table (years 2025-2030)\nDO $$\nBEGIN\n    FOR year IN 2025..2030 LOOP\n        EXECUTE format(\n            'CREATE TABLE IF NOT EXISTS ma_signals_%s PARTITION OF ma_signals FOR VALUES FROM (%L) TO (%L)',\n            year,\n            year || '-01-01',\n            (year + 1) || '-01-01'\n        );\n    END LOOP;\nEND $$;\n\n-- Create indexes for efficient querying\nCREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);\nCREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);\nCREATE INDEX IF NOT EXISTS idx_ma_signals_unreported ON ma_signals(signal_date) WHERE reported_at IS NULL;\n";
// Get secret from Secrets Manager
function getSecret(secretName) {
    return __awaiter(this, void 0, void 0, function () {
        var client, command, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    client = new client_secrets_manager_1.SecretsManagerClient({});
                    command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretName });
                    return [4 /*yield*/, client.send(command)];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.SecretString || ''];
            }
        });
    });
}
// Get database pool using RDS Data API (no VPC/NAT Gateway needed)
function getDbPool() {
    var resourceArn = process.env.DB_CLUSTER_ARN;
    var secretArn = process.env.DB_SECRET_ARN;
    var database = process.env.DB_NAME || 'marketsage';
    return new DataApiPool(resourceArn, secretArn, database);
}
// Get current trading day (today in ET)
function getCurrentTradingDay() {
    var now = new Date();
    var etOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return now.toLocaleDateString('en-CA', etOptions); // YYYY-MM-DD format
}
// Run migrations
function runMigrations(pool) {
    return __awaiter(this, void 0, void 0, function () {
        var client;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[SignalGenerator] Running migrations...');
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 4, 5]);
                    return [4 /*yield*/, client.query(MIGRATION_SQL)];
                case 3:
                    _a.sent();
                    console.log('[SignalGenerator] Migrations completed successfully');
                    return [3 /*break*/, 5];
                case 4:
                    client.release();
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Generate signals for Russell 1000 tickers with price increase and MA crossovers
function generateSignals(pool, tradeDate) {
    return __awaiter(this, void 0, void 0, function () {
        var client, query, result, signals, activeSignals, generatedAt, _i, _a, row, ma20Signal, ma60Signal, ma250Signal, priceChangePercent, signal, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("[SignalGenerator] Generating signals for ".concat(tradeDate, "..."));
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 10, 12, 13]);
                    query = "\n      WITH ticker_data AS (\n        SELECT\n          r.ticker,\n          ph.trade_date,\n          ph.c AS close_price,\n          ph.prev_c AS prev_close_price,\n          s.sma_20,\n          s.sma_60,\n          s.sma_250\n        FROM russell_1000 r\n        INNER JOIN price_history ph ON r.ticker = ph.ticker\n        LEFT JOIN sma s ON r.ticker = s.ticker AND ph.trade_date = s.trade_date\n        WHERE ph.trade_date = $1\n          AND ph.c > ph.prev_c  -- Only tickers with price increase\n      ),\n      signals AS (\n        SELECT\n          ticker,\n          trade_date::text,\n          close_price::float,\n          prev_close_price::float,\n          sma_20::float,\n          sma_60::float,\n          sma_250::float,\n          CASE\n            WHEN prev_close_price < sma_20 AND close_price >= sma_20 THEN 'CROSS_ABOVE'\n            WHEN prev_close_price >= sma_20 AND close_price < sma_20 THEN 'CROSS_BELOW'\n            ELSE 'NONE'\n          END AS ma_20_signal,\n          CASE\n            WHEN prev_close_price < sma_60 AND close_price >= sma_60 THEN 'CROSS_ABOVE'\n            WHEN prev_close_price >= sma_60 AND close_price < sma_60 THEN 'CROSS_BELOW'\n            ELSE 'NONE'\n          END AS ma_60_signal,\n          CASE\n            WHEN prev_close_price < sma_250 AND close_price >= sma_250 THEN 'CROSS_ABOVE'\n            WHEN prev_close_price >= sma_250 AND close_price < sma_250 THEN 'CROSS_BELOW'\n            ELSE 'NONE'\n          END AS ma_250_signal\n        FROM ticker_data\n      )\n      SELECT * FROM signals\n      WHERE ma_20_signal != 'NONE'\n         OR ma_60_signal != 'NONE'\n         OR ma_250_signal != 'NONE'\n      ORDER BY ticker\n    ";
                    return [4 /*yield*/, client.query(query, [tradeDate])];
                case 3:
                    result = _b.sent();
                    console.log("[SignalGenerator] Found ".concat(result.rows.length, " tickers with valid crossover signals for ").concat(tradeDate));
                    if (result.rows.length === 0) {
                        return [2 /*return*/, {
                                success: true,
                                action: 'generate-signals',
                                message: "No crossover signals found for ".concat(tradeDate, ". Make sure price_history and sma tables are populated."),
                                stats: {
                                    tickersProcessed: 0,
                                    signalsGenerated: 0,
                                    activeSignals: { ma20: 0, ma60: 0, ma250: 0 },
                                },
                                signals: [],
                            }];
                    }
                    signals = [];
                    activeSignals = { ma20: 0, ma60: 0, ma250: 0 };
                    generatedAt = new Date().toISOString();
                    return [4 /*yield*/, client.query('BEGIN')];
                case 4:
                    _b.sent();
                    _i = 0, _a = result.rows;
                    _b.label = 5;
                case 5:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    row = _a[_i];
                    ma20Signal = row.ma_20_signal;
                    ma60Signal = row.ma_60_signal;
                    ma250Signal = row.ma_250_signal;
                    // Count active signals
                    if (ma20Signal !== 'NONE')
                        activeSignals.ma20++;
                    if (ma60Signal !== 'NONE')
                        activeSignals.ma60++;
                    if (ma250Signal !== 'NONE')
                        activeSignals.ma250++;
                    priceChangePercent = ((row.close_price - row.prev_close_price) / row.prev_close_price) * 100;
                    signal = {
                        ticker: row.ticker,
                        signalDate: tradeDate,
                        closePrice: row.close_price,
                        prevClosePrice: row.prev_close_price,
                        priceChangePercent: priceChangePercent,
                        sma20: row.sma_20,
                        sma60: row.sma_60,
                        sma250: row.sma_250,
                        ma20Signal: ma20Signal,
                        ma60Signal: ma60Signal,
                        ma250Signal: ma250Signal,
                        generatedAt: generatedAt,
                        reportedAt: null,
                    };
                    // Insert valid signal into database
                    // Use NOW() for generated_at since RDS Data API doesn't auto-convert ISO strings to timestamps
                    return [4 /*yield*/, client.query("\n        INSERT INTO ma_signals (\n          signal_date, ticker, close_price, prev_close_price, price_change_pct,\n          ma_20_signal, ma_60_signal, ma_250_signal,\n          sma_20, sma_60, sma_250, generated_at\n        )\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())\n        ON CONFLICT (signal_date, ticker) DO UPDATE SET\n          close_price = EXCLUDED.close_price,\n          prev_close_price = EXCLUDED.prev_close_price,\n          price_change_pct = EXCLUDED.price_change_pct,\n          ma_20_signal = EXCLUDED.ma_20_signal,\n          ma_60_signal = EXCLUDED.ma_60_signal,\n          ma_250_signal = EXCLUDED.ma_250_signal,\n          sma_20 = EXCLUDED.sma_20,\n          sma_60 = EXCLUDED.sma_60,\n          sma_250 = EXCLUDED.sma_250,\n          generated_at = NOW()\n      ", [
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
                        ])];
                case 6:
                    // Insert valid signal into database
                    // Use NOW() for generated_at since RDS Data API doesn't auto-convert ISO strings to timestamps
                    _b.sent();
                    signals.push(signal);
                    _b.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [4 /*yield*/, client.query('COMMIT')];
                case 9:
                    _b.sent();
                    console.log("[SignalGenerator] Stored ".concat(signals.length, " valid crossover signals"));
                    console.log("[SignalGenerator] Signals by MA: 20-day=".concat(activeSignals.ma20, ", 60-day=").concat(activeSignals.ma60, ", 250-day=").concat(activeSignals.ma250));
                    return [2 /*return*/, {
                            success: true,
                            action: 'generate-signals',
                            message: "Generated ".concat(signals.length, " crossover signals for ").concat(tradeDate),
                            stats: {
                                tickersProcessed: result.rows.length,
                                signalsGenerated: signals.length,
                                activeSignals: activeSignals,
                            },
                            signals: signals,
                        }];
                case 10:
                    error_1 = _b.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 11:
                    _b.sent();
                    throw error_1;
                case 12:
                    client.release();
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    });
}
// Query signals from database
function querySignals(pool, signalDate, ticker) {
    return __awaiter(this, void 0, void 0, function () {
        var client, query, params, result, signals;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 4, 5]);
                    query = "\n      SELECT\n        signal_date::text,\n        ticker,\n        close_price::float,\n        prev_close_price::float,\n        price_change_pct::float,\n        ma_20_signal,\n        ma_60_signal,\n        ma_250_signal,\n        sma_20::float,\n        sma_60::float,\n        sma_250::float,\n        generated_at::text,\n        reported_at::text\n      FROM ma_signals\n      WHERE signal_date = $1\n    ";
                    params = [signalDate];
                    if (ticker) {
                        query += " AND ticker = $2";
                        params.push(ticker);
                    }
                    query += " ORDER BY price_change_pct DESC";
                    return [4 /*yield*/, client.query(query, params.filter(function (p) { return p !== undefined; }))];
                case 3:
                    result = _a.sent();
                    signals = result.rows.map(function (row) { return ({
                        ticker: row.ticker,
                        signalDate: row.signal_date,
                        closePrice: row.close_price,
                        prevClosePrice: row.prev_close_price,
                        priceChangePercent: row.price_change_pct,
                        sma20: row.sma_20,
                        sma60: row.sma_60,
                        sma250: row.sma_250,
                        ma20Signal: row.ma_20_signal,
                        ma60Signal: row.ma_60_signal,
                        ma250Signal: row.ma_250_signal,
                        generatedAt: row.generated_at,
                        reportedAt: row.reported_at,
                    }); });
                    return [2 /*return*/, {
                            success: true,
                            action: 'query-signals',
                            message: "Found ".concat(signals.length, " signals for ").concat(signalDate).concat(ticker ? " (".concat(ticker, ")") : ''),
                            signals: signals,
                        }];
                case 4:
                    client.release();
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var action, tradeDate, pool, _a, signalDate, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                action = event.action || 'generate-signals';
                tradeDate = event.tradeDate || getCurrentTradingDay();
                console.log("[SignalGenerator] Starting with action: ".concat(action, ", tradeDate: ").concat(tradeDate));
                pool = null;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 11, 12, 15]);
                return [4 /*yield*/, getDbPool()];
            case 2:
                pool = _b.sent();
                _a = action;
                switch (_a) {
                    case 'migrate': return [3 /*break*/, 3];
                    case 'generate-signals': return [3 /*break*/, 5];
                    case 'query-signals': return [3 /*break*/, 7];
                }
                return [3 /*break*/, 9];
            case 3: return [4 /*yield*/, runMigrations(pool)];
            case 4:
                _b.sent();
                return [2 /*return*/, {
                        success: true,
                        action: 'migrate',
                        message: 'Migrations completed successfully',
                    }];
            case 5: return [4 /*yield*/, generateSignals(pool, tradeDate)];
            case 6: return [2 /*return*/, _b.sent()];
            case 7:
                signalDate = event.signalDate || tradeDate;
                return [4 /*yield*/, querySignals(pool, signalDate, event.ticker)];
            case 8: return [2 /*return*/, _b.sent()];
            case 9: return [2 /*return*/, {
                    success: false,
                    action: action,
                    message: "Unknown action: ".concat(action, ". Valid actions: generate-signals, query-signals, migrate"),
                }];
            case 10: return [3 /*break*/, 15];
            case 11:
                error_2 = _b.sent();
                console.error('[SignalGenerator] Error:', error_2);
                return [2 /*return*/, {
                        success: false,
                        action: action,
                        message: "Error: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)),
                    }];
            case 12:
                if (!pool) return [3 /*break*/, 14];
                return [4 /*yield*/, pool.end()];
            case 13:
                _b.sent();
                _b.label = 14;
            case 14: return [7 /*endfinally*/];
            case 15: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
