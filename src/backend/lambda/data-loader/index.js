"use strict";
/**
 * Data Loader Lambda
 * Fetches market data from Polygon API and loads into Aurora database
 * - Runs database migrations
 * - Fetches all tickers snapshot from Polygon
 * - Writes ticker metadata and price history to database
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
var pg_1 = require("pg");
// Migration SQL
var MIGRATION_SQL = "\n-- Table A: ticker_metadata (The Registry)\nCREATE TABLE IF NOT EXISTS ticker_metadata (\n    ticker VARCHAR(10) PRIMARY KEY,\n    name TEXT NOT NULL,\n    sector VARCHAR(100),\n    industry VARCHAR(100),\n    market_cap BIGINT,\n    last_updated TIMESTAMP DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_ticker_metadata_sector ON ticker_metadata(sector);\n\n-- Table B: price_history (The Time-Series Core)\nCREATE TABLE IF NOT EXISTS price_history (\n    trade_date DATE NOT NULL,\n    ticker VARCHAR(10) NOT NULL,\n    o NUMERIC(18,4),\n    h NUMERIC(18,4),\n    l NUMERIC(18,4),\n    c NUMERIC(18,4) NOT NULL,\n    v BIGINT,\n    vw NUMERIC(18,4),\n    change NUMERIC(20,10),       -- Today's change from previous day (high precision)\n    change_pct NUMERIC(20,10),   -- Today's change percentage (high precision)\n    -- Previous day OHLCV (optional, only from snapshot endpoint)\n    prev_o NUMERIC(18,4),\n    prev_h NUMERIC(18,4),\n    prev_l NUMERIC(18,4),\n    prev_c NUMERIC(18,4),\n    prev_v BIGINT,\n    prev_vw NUMERIC(18,4),\n    PRIMARY KEY (trade_date, ticker),\n    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)\n) PARTITION BY RANGE (trade_date);\n\n-- Migration: Drop close_price column if it exists (it was redundant with c)\nDO $$\nBEGIN\n    ALTER TABLE price_history DROP COLUMN IF EXISTS close_price;\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Alter v column type if table already exists (for migrations)\nDO $$\nBEGIN\n    ALTER TABLE price_history ALTER COLUMN v TYPE BIGINT;\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add change column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change NUMERIC(20,10);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Alter change column to high precision\nDO $$\nBEGIN\n    ALTER TABLE price_history ALTER COLUMN change TYPE NUMERIC(20,10);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add change_pct column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change_pct NUMERIC(20,10);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Alter change_pct column to high precision\nDO $$\nBEGIN\n    ALTER TABLE price_history ALTER COLUMN change_pct TYPE NUMERIC(20,10);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_o column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_o NUMERIC(18,4);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_h column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_h NUMERIC(18,4);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_l column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_l NUMERIC(18,4);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_c column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_c NUMERIC(18,4);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_v column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_v BIGINT;\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Add prev_vw column if it doesn't exist\nDO $$\nBEGIN\n    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_vw NUMERIC(18,4);\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Migration: Increase NUMERIC precision to prevent overflow errors\n-- Change NUMERIC(12,4) to NUMERIC(18,4) for price columns, NUMERIC(18,10) to NUMERIC(20,10) for change columns\nDO $$\nDECLARE\n    partition_name TEXT;\nBEGIN\n    -- First, alter the parent table\n    ALTER TABLE price_history ALTER COLUMN o TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN h TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN l TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN c TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN vw TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN prev_o TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN prev_h TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN prev_l TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN prev_c TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN prev_vw TYPE NUMERIC(18,4);\n    ALTER TABLE price_history ALTER COLUMN change TYPE NUMERIC(20,10);\n    ALTER TABLE price_history ALTER COLUMN change_pct TYPE NUMERIC(20,10);\n\n    -- Explicitly alter each partition (2020-2030)\n    FOR year IN 2020..2030 LOOP\n        partition_name := 'price_history_' || year;\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN o TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN h TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN l TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN c TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN vw TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_o TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_h TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_l TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_c TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN prev_vw TYPE NUMERIC(18,4)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN change TYPE NUMERIC(20,10)', partition_name);\n        EXECUTE format('ALTER TABLE IF EXISTS %I ALTER COLUMN change_pct TYPE NUMERIC(20,10)', partition_name);\n    END LOOP;\nEXCEPTION\n    WHEN others THEN NULL;\nEND $$;\n\n-- Create partitions for years 2020-2030\nDO $$\nBEGIN\n    FOR year IN 2020..2030 LOOP\n        EXECUTE format(\n            'CREATE TABLE IF NOT EXISTS price_history_%s PARTITION OF price_history FOR VALUES FROM (%L) TO (%L)',\n            year,\n            year || '-01-01',\n            (year + 1) || '-01-01'\n        );\n    END LOOP;\nEND $$;\n\nCREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker);\n\n-- Table C: russell_1000 (Russell 1000 Index Constituents)\nCREATE TABLE IF NOT EXISTS russell_1000 (\n    ticker VARCHAR(10) PRIMARY KEY,\n    name TEXT NOT NULL\n);\n\n-- Table C2: nasdaq_100 (Nasdaq 100 Index Constituents)\nCREATE TABLE IF NOT EXISTS nasdaq_100 (\n    ticker VARCHAR(10) PRIMARY KEY,\n    name TEXT NOT NULL,\n    weight NUMERIC(8, 4)  -- Index weight percentage (e.g., 13.60 for 13.60%)\n);\n\n-- Table D: sma (Simple Moving Averages)\n-- Stores 20-day, 60-day, and 250-day SMA values for each ticker per date\nCREATE TABLE IF NOT EXISTS sma (\n    trade_date DATE NOT NULL,\n    ticker VARCHAR(10) NOT NULL,\n    sma_20 NUMERIC(18,4),   -- 20-day Simple Moving Average\n    sma_60 NUMERIC(18,4),   -- 60-day Simple Moving Average\n    sma_250 NUMERIC(18,4),  -- 250-day Simple Moving Average\n    last_updated TIMESTAMP DEFAULT NOW(),\n    PRIMARY KEY (trade_date, ticker),\n    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)\n) PARTITION BY RANGE (trade_date);\n\n-- Create partitions for SMA table (years 2020-2030)\nDO $$\nBEGIN\n    FOR year IN 2020..2030 LOOP\n        EXECUTE format(\n            'CREATE TABLE IF NOT EXISTS sma_%s PARTITION OF sma FOR VALUES FROM (%L) TO (%L)',\n            year,\n            year || '-01-01',\n            (year + 1) || '-01-01'\n        );\n    END LOOP;\nEND $$;\n\nCREATE INDEX IF NOT EXISTS idx_sma_ticker ON sma(ticker);\n\n-- Table E: ma_signals (Moving Average Crossover Signals)\n-- Stores 20-day, 60-day, and 250-day MA crossover signals for each ticker per date\nCREATE TABLE IF NOT EXISTS ma_signals (\n    signal_date DATE NOT NULL,\n    ticker VARCHAR(10) NOT NULL,\n    ma_20_signal VARCHAR(20),       -- Signal: CROSS_ABOVE, CROSS_BELOW, NONE\n    ma_60_signal VARCHAR(20),\n    ma_250_signal VARCHAR(20),\n    close_price NUMERIC(12, 4),\n    sma_20 NUMERIC(12, 4),\n    sma_60 NUMERIC(12, 4),\n    sma_250 NUMERIC(12, 4),\n    created_at TIMESTAMP DEFAULT NOW(),\n    PRIMARY KEY (signal_date, ticker),\n    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)\n) PARTITION BY RANGE (signal_date);\n\n-- Create partitions for ma_signals table (years 2025-2030)\nDO $$\nBEGIN\n    FOR year IN 2025..2030 LOOP\n        EXECUTE format(\n            'CREATE TABLE IF NOT EXISTS ma_signals_%s PARTITION OF ma_signals FOR VALUES FROM (%L) TO (%L)',\n            year,\n            year || '-01-01',\n            (year + 1) || '-01-01'\n        );\n    END LOOP;\nEND $$;\n\nCREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);\nCREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);\n";
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
// Get database pool
function getDbPool() {
    return __awaiter(this, void 0, void 0, function () {
        var secretName, secretStr, secret;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    secretName = process.env.DB_SECRET_ARN || 'marketsage/aurora/credentials';
                    return [4 /*yield*/, getSecret(secretName)];
                case 1:
                    secretStr = _a.sent();
                    secret = JSON.parse(secretStr);
                    return [2 /*return*/, new pg_1.Pool({
                            host: secret.host || process.env.DB_CLUSTER_ENDPOINT,
                            port: secret.port || 5432,
                            database: secret.dbname || process.env.DB_NAME || 'marketsage',
                            user: secret.username,
                            password: secret.password,
                            max: 10,
                            idleTimeoutMillis: 30000,
                            connectionTimeoutMillis: 30000, // 30s to handle Aurora Serverless cold starts
                        })];
            }
        });
    });
}
// Get Polygon API key
function getPolygonApiKey() {
    return __awaiter(this, void 0, void 0, function () {
        var secretName, secretStr, parsed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    secretName = process.env.FINANCIAL_API_KEY_SECRET || 'marketsage/api/polygon';
                    return [4 /*yield*/, getSecret(secretName)];
                case 1:
                    secretStr = _a.sent();
                    // Secret might be JSON or plain string
                    try {
                        parsed = JSON.parse(secretStr);
                        return [2 /*return*/, parsed.apiKey || parsed.api_key || secretStr];
                    }
                    catch (_b) {
                        return [2 /*return*/, secretStr];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// Fetch all tickers snapshot from Polygon
function fetchAllTickersSnapshot(apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, errorText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=".concat(apiKey);
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("Polygon API error: ".concat(response.status, " - ").concat(errorText));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
// Fetch aggregates (daily bars) from Polygon for a ticker
function fetchAggregates(apiKey, ticker, fromDate, toDate) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, errorText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://api.polygon.io/v2/aggs/ticker/".concat(ticker, "/range/1/day/").concat(fromDate, "/").concat(toDate, "?adjusted=true&sort=asc&apiKey=").concat(apiKey);
                    console.log("[DataLoader] Fetching aggregates for ".concat(ticker, " from ").concat(fromDate, " to ").concat(toDate, "..."));
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("Polygon API error for ".concat(ticker, ": ").concat(response.status, " - ").concat(errorText));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
// Convert Unix millisecond timestamp to YYYY-MM-DD date string
function unixMsToDateString(unixMs) {
    var date = new Date(unixMs);
    return date.toISOString().split('T')[0];
}
// Fetch SMA (Simple Moving Average) from Polygon for a ticker
function fetchSMA(apiKey, ticker, timestamp, window) {
    return __awaiter(this, void 0, void 0, function () {
        var url, response, errorText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://api.polygon.io/v1/indicators/sma/".concat(ticker, "?timestamp=").concat(timestamp, "&timespan=day&adjusted=true&window=").concat(window, "&series_type=close&order=desc&limit=1&apiKey=").concat(apiKey);
                    console.log("[DataLoader] Fetching SMA(".concat(window, ") for ").concat(ticker, " at ").concat(timestamp, "..."));
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("Polygon SMA API error for ".concat(ticker, ": ").concat(response.status, " - ").concat(errorText));
                case 3: return [2 /*return*/, response.json()];
            }
        });
    });
}
// Delay helper for rate limiting
function delay(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
// Run database migrations
function runMigrations(pool) {
    return __awaiter(this, void 0, void 0, function () {
        var client;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[DataLoader] Running migrations...');
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 4, 5]);
                    return [4 /*yield*/, client.query(MIGRATION_SQL)];
                case 3:
                    _a.sent();
                    console.log('[DataLoader] Migrations completed successfully');
                    return [3 /*break*/, 5];
                case 4:
                    client.release();
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// Load snapshot data into database
function loadSnapshotData(pool, snapshots, tradeDate) {
    return __awaiter(this, void 0, void 0, function () {
        var client, metadataInserted, pricesInserted, batchSize, i, batch, _i, batch_1, snapshot, dayData, error_1;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    console.log("[DataLoader] Loading ".concat(snapshots.length, " tickers for ").concat(tradeDate, "..."));
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _q.sent();
                    metadataInserted = 0;
                    pricesInserted = 0;
                    _q.label = 2;
                case 2:
                    _q.trys.push([2, 13, 15, 16]);
                    return [4 /*yield*/, client.query('BEGIN')];
                case 3:
                    _q.sent();
                    batchSize = 1000;
                    i = 0;
                    _q.label = 4;
                case 4:
                    if (!(i < snapshots.length)) return [3 /*break*/, 11];
                    batch = snapshots.slice(i, i + batchSize);
                    _i = 0, batch_1 = batch;
                    _q.label = 5;
                case 5:
                    if (!(_i < batch_1.length)) return [3 /*break*/, 9];
                    snapshot = batch_1[_i];
                    dayData = ((_a = snapshot.day) === null || _a === void 0 ? void 0 : _a.c) ? snapshot.day : snapshot.prevDay;
                    // Skip if no data available
                    if (!dayData || dayData.c === undefined) {
                        return [3 /*break*/, 8];
                    }
                    // Upsert ticker metadata
                    return [4 /*yield*/, client.query("\n          INSERT INTO ticker_metadata (ticker, name, last_updated)\n          VALUES ($1, $2, NOW())\n          ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()\n        ", [snapshot.ticker, snapshot.ticker])];
                case 6:
                    // Upsert ticker metadata
                    _q.sent();
                    metadataInserted++;
                    // Upsert price history (including change values and prevDay from snapshot)
                    return [4 /*yield*/, client.query("\n          INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,\n                                     prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)\n          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)\n          ON CONFLICT (trade_date, ticker) DO UPDATE SET\n            o = EXCLUDED.o,\n            h = EXCLUDED.h,\n            l = EXCLUDED.l,\n            c = EXCLUDED.c,\n            v = EXCLUDED.v,\n            vw = EXCLUDED.vw,\n            change = EXCLUDED.change,\n            change_pct = EXCLUDED.change_pct,\n            prev_o = EXCLUDED.prev_o,\n            prev_h = EXCLUDED.prev_h,\n            prev_l = EXCLUDED.prev_l,\n            prev_c = EXCLUDED.prev_c,\n            prev_v = EXCLUDED.prev_v,\n            prev_vw = EXCLUDED.prev_vw\n        ", [
                            tradeDate,
                            snapshot.ticker,
                            dayData.o,
                            dayData.h,
                            dayData.l,
                            dayData.c,
                            dayData.v,
                            dayData.vw,
                            (_b = snapshot.todaysChange) !== null && _b !== void 0 ? _b : null,
                            (_c = snapshot.todaysChangePerc) !== null && _c !== void 0 ? _c : null,
                            (_e = (_d = snapshot.prevDay) === null || _d === void 0 ? void 0 : _d.o) !== null && _e !== void 0 ? _e : null,
                            (_g = (_f = snapshot.prevDay) === null || _f === void 0 ? void 0 : _f.h) !== null && _g !== void 0 ? _g : null,
                            (_j = (_h = snapshot.prevDay) === null || _h === void 0 ? void 0 : _h.l) !== null && _j !== void 0 ? _j : null,
                            (_l = (_k = snapshot.prevDay) === null || _k === void 0 ? void 0 : _k.c) !== null && _l !== void 0 ? _l : null,
                            ((_m = snapshot.prevDay) === null || _m === void 0 ? void 0 : _m.v) != null ? Math.round(snapshot.prevDay.v) : null,
                            (_p = (_o = snapshot.prevDay) === null || _o === void 0 ? void 0 : _o.vw) !== null && _p !== void 0 ? _p : null,
                        ])];
                case 7:
                    // Upsert price history (including change values and prevDay from snapshot)
                    _q.sent();
                    pricesInserted++;
                    _q.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 5];
                case 9:
                    console.log("[DataLoader] Processed ".concat(Math.min(i + batchSize, snapshots.length), "/").concat(snapshots.length, " tickers"));
                    _q.label = 10;
                case 10:
                    i += batchSize;
                    return [3 /*break*/, 4];
                case 11: return [4 /*yield*/, client.query('COMMIT')];
                case 12:
                    _q.sent();
                    console.log("[DataLoader] Successfully loaded ".concat(pricesInserted, " price records"));
                    return [3 /*break*/, 16];
                case 13:
                    error_1 = _q.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 14:
                    _q.sent();
                    throw error_1;
                case 15:
                    client.release();
                    return [7 /*endfinally*/];
                case 16: return [2 /*return*/, { metadataInserted: metadataInserted, pricesInserted: pricesInserted }];
            }
        });
    });
}
// Get current trading day (today in ET)
// Uses US Eastern Time since US markets operate on ET
function getCurrentTradingDay() {
    // Get current time in US Eastern Time
    var now = new Date();
    var etOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return now.toLocaleDateString('en-CA', etOptions); // en-CA gives YYYY-MM-DD format
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var action, tradeDate, pool, apiKey, snapshot, stats, metadataCount, priceCount, tickersToQuery, result, tickersToQuery, result, russellData, client, inserted, _i, russellData_1, record, error_2, russellCount, nasdaqData, client, inserted, _a, nasdaqData_1, record, error_3, nasdaqCount, tickersToLoad, fromDate, toDate, apiKey, client, totalPricesInserted, totalMetadataInserted, _b, tickersToLoad_1, ticker, aggResponse, _c, _d, bar, barTradeDate, error_4, fromDate, toDate, batchStart, batchSize, russellResult, allTickers, totalTickers, tickersToProcess, apiKey, client, totalPricesInserted, tickersProcessed, tickersFailed, failedTickers, _e, tickersToProcess_1, ticker, aggResponse, _f, _g, bar, barTradeDate, tickerError_1, _h, nextBatchStart, hasMore, tickersToLoad, apiKey, client, smaRecordsInserted, _j, tickersToLoad_2, ticker, _k, sma20Response, sma60Response, sma250Response, sma20, sma60, sma250, smaTradeDate, error_5, batchStart, batchSize, russellResult, allTickers, totalTickers, tickersToProcess, apiKey, client, smaRecordsInserted, tickersProcessed, tickersFailed, failedTickers, _l, tickersToProcess_2, ticker, _m, sma20Response, sma60Response, sma250Response, sma20, sma60, sma250, smaTradeDate, tickerError_2, nextBatchStart, hasMore, error_6;
    var _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21;
    return __generator(this, function (_22) {
        switch (_22.label) {
            case 0:
                action = event.action || 'full';
                tradeDate = event.tradeDate || getCurrentTradingDay();
                console.log("[DataLoader] Starting with action: ".concat(action, ", tradeDate: ").concat(tradeDate));
                pool = null;
                _22.label = 1;
            case 1:
                _22.trys.push([1, 124, 125, 128]);
                return [4 /*yield*/, getDbPool()];
            case 2:
                pool = _22.sent();
                if (!(action === 'migrate' || action === 'full')) return [3 /*break*/, 4];
                return [4 /*yield*/, runMigrations(pool)];
            case 3:
                _22.sent();
                if (action === 'migrate') {
                    return [2 /*return*/, {
                            success: true,
                            action: 'migrate',
                            message: 'Migrations completed successfully',
                        }];
                }
                _22.label = 4;
            case 4:
                if (!(action === 'load-snapshot' || action === 'full')) return [3 /*break*/, 10];
                return [4 /*yield*/, getPolygonApiKey()];
            case 5:
                apiKey = _22.sent();
                // Fetch snapshot
                console.log('[DataLoader] Fetching snapshot from Polygon...');
                return [4 /*yield*/, fetchAllTickersSnapshot(apiKey)];
            case 6:
                snapshot = _22.sent();
                console.log("[DataLoader] Received ".concat(snapshot.count, " tickers from Polygon"));
                return [4 /*yield*/, loadSnapshotData(pool, snapshot.tickers, tradeDate)];
            case 7:
                stats = _22.sent();
                return [4 /*yield*/, pool.query('SELECT COUNT(*) as count FROM ticker_metadata').then(function (r) { return r.rows; })];
            case 8:
                metadataCount = (_22.sent())[0];
                return [4 /*yield*/, pool.query('SELECT COUNT(*) as count FROM price_history WHERE trade_date = $1', [tradeDate]).then(function (r) { return r.rows; })];
            case 9:
                priceCount = (_22.sent())[0];
                console.log("[DataLoader] Verification - Metadata: ".concat(metadataCount.count, ", Prices for ").concat(tradeDate, ": ").concat(priceCount.count));
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Successfully loaded snapshot data for ".concat(tradeDate),
                        stats: {
                            tickersProcessed: snapshot.count,
                            metadataInserted: stats.metadataInserted,
                            pricesInserted: stats.pricesInserted,
                        },
                    }];
            case 10:
                if (!(action === 'query')) return [3 /*break*/, 12];
                tickersToQuery = event.tickers || ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
                return [4 /*yield*/, pool.query("SELECT trade_date::text, ticker, o::float, h::float, l::float, c::float, v::float, vw::float,\n                change::float, change_pct::float,\n                prev_o::float, prev_h::float, prev_l::float, prev_c::float, prev_v::float, prev_vw::float\n         FROM price_history\n         WHERE ticker = ANY($1) AND trade_date = $2\n         ORDER BY ticker", [tickersToQuery, tradeDate])];
            case 11:
                result = _22.sent();
                return [2 /*return*/, {
                        success: true,
                        action: 'query',
                        message: "Retrieved ".concat(result.rows.length, " records for ").concat(tradeDate),
                        data: result.rows,
                    }];
            case 12:
                if (!(action === 'query-sma')) return [3 /*break*/, 14];
                tickersToQuery = event.tickers || ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
                return [4 /*yield*/, pool.query("SELECT trade_date::text, ticker, sma_20::float, sma_60::float, sma_250::float, last_updated\n         FROM sma\n         WHERE ticker = ANY($1)\n         ORDER BY trade_date DESC, ticker\n         LIMIT 100", [tickersToQuery])];
            case 13:
                result = _22.sent();
                return [2 /*return*/, {
                        success: true,
                        action: 'query-sma',
                        message: "Retrieved ".concat(result.rows.length, " SMA records"),
                        data: result.rows,
                    }];
            case 14:
                if (!(action === 'load-russell-1000')) return [3 /*break*/, 30];
                russellData = event.russellData;
                if (!russellData || russellData.length === 0) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'russellData is required for load-russell-1000 action',
                        }];
                }
                console.log("[DataLoader] Loading ".concat(russellData.length, " Russell 1000 tickers..."));
                // Ensure russell_1000 table exists
                return [4 /*yield*/, pool.query("\n        CREATE TABLE IF NOT EXISTS russell_1000 (\n          ticker VARCHAR(10) PRIMARY KEY,\n          name TEXT NOT NULL\n        )\n      ")];
            case 15:
                // Ensure russell_1000 table exists
                _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 16:
                client = _22.sent();
                inserted = 0;
                _22.label = 17;
            case 17:
                _22.trys.push([17, 25, 27, 28]);
                return [4 /*yield*/, client.query('BEGIN')];
            case 18:
                _22.sent();
                // Truncate existing data
                return [4 /*yield*/, client.query('TRUNCATE TABLE russell_1000')];
            case 19:
                // Truncate existing data
                _22.sent();
                _i = 0, russellData_1 = russellData;
                _22.label = 20;
            case 20:
                if (!(_i < russellData_1.length)) return [3 /*break*/, 23];
                record = russellData_1[_i];
                return [4 /*yield*/, client.query('INSERT INTO russell_1000 (ticker, name) VALUES ($1, $2)', [record.ticker, record.name])];
            case 21:
                _22.sent();
                inserted++;
                _22.label = 22;
            case 22:
                _i++;
                return [3 /*break*/, 20];
            case 23: return [4 /*yield*/, client.query('COMMIT')];
            case 24:
                _22.sent();
                console.log("[DataLoader] Successfully loaded ".concat(inserted, " Russell 1000 tickers"));
                return [3 /*break*/, 28];
            case 25:
                error_2 = _22.sent();
                return [4 /*yield*/, client.query('ROLLBACK')];
            case 26:
                _22.sent();
                throw error_2;
            case 27:
                client.release();
                return [7 /*endfinally*/];
            case 28: return [4 /*yield*/, pool.query('SELECT COUNT(*) as count FROM russell_1000').then(function (r) { return r.rows; })];
            case 29:
                russellCount = (_22.sent())[0].count;
                console.log("[DataLoader] Russell 1000 table now has ".concat(russellCount, " tickers"));
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Successfully loaded ".concat(inserted, " Russell 1000 tickers"),
                        stats: {
                            tickersProcessed: russellData.length,
                            metadataInserted: inserted,
                        },
                    }];
            case 30:
                if (!(action === 'load-nasdaq-100')) return [3 /*break*/, 46];
                nasdaqData = event.nasdaqData;
                if (!nasdaqData || nasdaqData.length === 0) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'nasdaqData is required for load-nasdaq-100 action',
                        }];
                }
                console.log("[DataLoader] Loading ".concat(nasdaqData.length, " Nasdaq 100 tickers..."));
                // Ensure nasdaq_100 table exists
                return [4 /*yield*/, pool.query("\n        CREATE TABLE IF NOT EXISTS nasdaq_100 (\n          ticker VARCHAR(10) PRIMARY KEY,\n          name TEXT NOT NULL,\n          weight NUMERIC(8, 4)\n        )\n      ")];
            case 31:
                // Ensure nasdaq_100 table exists
                _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 32:
                client = _22.sent();
                inserted = 0;
                _22.label = 33;
            case 33:
                _22.trys.push([33, 41, 43, 44]);
                return [4 /*yield*/, client.query('BEGIN')];
            case 34:
                _22.sent();
                // Truncate existing data
                return [4 /*yield*/, client.query('TRUNCATE TABLE nasdaq_100')];
            case 35:
                // Truncate existing data
                _22.sent();
                _a = 0, nasdaqData_1 = nasdaqData;
                _22.label = 36;
            case 36:
                if (!(_a < nasdaqData_1.length)) return [3 /*break*/, 39];
                record = nasdaqData_1[_a];
                return [4 /*yield*/, client.query('INSERT INTO nasdaq_100 (ticker, name, weight) VALUES ($1, $2, $3)', [record.ticker, record.name, record.weight])];
            case 37:
                _22.sent();
                inserted++;
                _22.label = 38;
            case 38:
                _a++;
                return [3 /*break*/, 36];
            case 39: return [4 /*yield*/, client.query('COMMIT')];
            case 40:
                _22.sent();
                console.log("[DataLoader] Successfully loaded ".concat(inserted, " Nasdaq 100 tickers"));
                return [3 /*break*/, 44];
            case 41:
                error_3 = _22.sent();
                return [4 /*yield*/, client.query('ROLLBACK')];
            case 42:
                _22.sent();
                throw error_3;
            case 43:
                client.release();
                return [7 /*endfinally*/];
            case 44: return [4 /*yield*/, pool.query('SELECT COUNT(*) as count FROM nasdaq_100').then(function (r) { return r.rows; })];
            case 45:
                nasdaqCount = (_22.sent())[0].count;
                console.log("[DataLoader] Nasdaq 100 table now has ".concat(nasdaqCount, " tickers"));
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Successfully loaded ".concat(inserted, " Nasdaq 100 tickers"),
                        stats: {
                            tickersProcessed: nasdaqData.length,
                            metadataInserted: inserted,
                        },
                    }];
            case 46:
                if (!(action === 'load-agg')) return [3 /*break*/, 65];
                tickersToLoad = event.tickers;
                fromDate = event.fromDate;
                toDate = event.toDate;
                if (!tickersToLoad || tickersToLoad.length === 0) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'tickers is required for load-agg action',
                        }];
                }
                if (!fromDate || !toDate) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'fromDate and toDate are required for load-agg action',
                        }];
                }
                return [4 /*yield*/, getPolygonApiKey()];
            case 47:
                apiKey = _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 48:
                client = _22.sent();
                totalPricesInserted = 0;
                totalMetadataInserted = 0;
                _22.label = 49;
            case 49:
                _22.trys.push([49, 61, 63, 64]);
                return [4 /*yield*/, client.query('BEGIN')];
            case 50:
                _22.sent();
                _b = 0, tickersToLoad_1 = tickersToLoad;
                _22.label = 51;
            case 51:
                if (!(_b < tickersToLoad_1.length)) return [3 /*break*/, 59];
                ticker = tickersToLoad_1[_b];
                // Ensure ticker exists in metadata
                return [4 /*yield*/, client.query("\n            INSERT INTO ticker_metadata (ticker, name, last_updated)\n            VALUES ($1, $2, NOW())\n            ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()\n          ", [ticker, ticker])];
            case 52:
                // Ensure ticker exists in metadata
                _22.sent();
                totalMetadataInserted++;
                return [4 /*yield*/, fetchAggregates(apiKey, ticker, fromDate, toDate)];
            case 53:
                aggResponse = _22.sent();
                if (!aggResponse.results || aggResponse.results.length === 0) {
                    console.log("[DataLoader] No results for ".concat(ticker));
                    return [3 /*break*/, 58];
                }
                console.log("[DataLoader] Got ".concat(aggResponse.resultsCount, " bars for ").concat(ticker));
                _c = 0, _d = aggResponse.results;
                _22.label = 54;
            case 54:
                if (!(_c < _d.length)) return [3 /*break*/, 57];
                bar = _d[_c];
                barTradeDate = unixMsToDateString(bar.t);
                return [4 /*yield*/, client.query("\n              INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,\n                                         prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)\n              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)\n              ON CONFLICT (trade_date, ticker) DO UPDATE SET\n                o = EXCLUDED.o,\n                h = EXCLUDED.h,\n                l = EXCLUDED.l,\n                c = EXCLUDED.c,\n                v = EXCLUDED.v,\n                vw = EXCLUDED.vw\n            ", [
                        barTradeDate,
                        ticker,
                        bar.o,
                        bar.h,
                        bar.l,
                        bar.c,
                        Math.round(bar.v), // Round volume to integer for BIGINT column
                        bar.vw,
                    ])];
            case 55:
                _22.sent();
                totalPricesInserted++;
                _22.label = 56;
            case 56:
                _c++;
                return [3 /*break*/, 54];
            case 57:
                console.log("[DataLoader] Inserted ".concat(aggResponse.resultsCount, " price records for ").concat(ticker));
                _22.label = 58;
            case 58:
                _b++;
                return [3 /*break*/, 51];
            case 59: return [4 /*yield*/, client.query('COMMIT')];
            case 60:
                _22.sent();
                console.log("[DataLoader] Successfully loaded ".concat(totalPricesInserted, " total price records"));
                return [3 /*break*/, 64];
            case 61:
                error_4 = _22.sent();
                return [4 /*yield*/, client.query('ROLLBACK')];
            case 62:
                _22.sent();
                throw error_4;
            case 63:
                client.release();
                return [7 /*endfinally*/];
            case 64: return [2 /*return*/, {
                    success: true,
                    action: action,
                    message: "Successfully loaded aggregates for ".concat(tickersToLoad.length, " ticker(s) from ").concat(fromDate, " to ").concat(toDate),
                    stats: {
                        tickersProcessed: tickersToLoad.length,
                        metadataInserted: totalMetadataInserted,
                        pricesInserted: totalPricesInserted,
                    },
                }];
            case 65:
                if (!(action === 'load-russell-agg')) return [3 /*break*/, 91];
                fromDate = event.fromDate;
                toDate = event.toDate;
                batchStart = (_o = event.batchStart) !== null && _o !== void 0 ? _o : 0;
                batchSize = (_p = event.batchSize) !== null && _p !== void 0 ? _p : 50;
                if (!fromDate || !toDate) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'fromDate and toDate are required for load-russell-agg action',
                        }];
                }
                return [4 /*yield*/, pool.query('SELECT ticker FROM russell_1000 ORDER BY ticker')];
            case 66:
                russellResult = _22.sent();
                allTickers = russellResult.rows.map(function (r) { return r.ticker; });
                totalTickers = allTickers.length;
                console.log("[DataLoader] Found ".concat(totalTickers, " Russell 1000 tickers"));
                tickersToProcess = allTickers.slice(batchStart, batchStart + batchSize);
                if (tickersToProcess.length === 0) {
                    return [2 /*return*/, {
                            success: true,
                            action: action,
                            message: "All ".concat(totalTickers, " Russell 1000 tickers have been processed"),
                            stats: {
                                tickersProcessed: 0,
                                pricesInserted: 0,
                            },
                        }];
                }
                console.log("[DataLoader] Processing batch: tickers ".concat(batchStart, " to ").concat(batchStart + tickersToProcess.length - 1, " (").concat(tickersToProcess[0], " to ").concat(tickersToProcess[tickersToProcess.length - 1], ")"));
                return [4 /*yield*/, getPolygonApiKey()];
            case 67:
                apiKey = _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 68:
                client = _22.sent();
                totalPricesInserted = 0;
                tickersProcessed = 0;
                tickersFailed = 0;
                failedTickers = [];
                _22.label = 69;
            case 69:
                _22.trys.push([69, , 89, 90]);
                _e = 0, tickersToProcess_1 = tickersToProcess;
                _22.label = 70;
            case 70:
                if (!(_e < tickersToProcess_1.length)) return [3 /*break*/, 88];
                ticker = tickersToProcess_1[_e];
                _22.label = 71;
            case 71:
                _22.trys.push([71, 81, , 87]);
                // Ensure ticker exists in metadata
                return [4 /*yield*/, client.query("\n              INSERT INTO ticker_metadata (ticker, name, last_updated)\n              VALUES ($1, $2, NOW())\n              ON CONFLICT (ticker) DO UPDATE SET last_updated = NOW()\n            ", [ticker, ticker])];
            case 72:
                // Ensure ticker exists in metadata
                _22.sent();
                return [4 /*yield*/, fetchAggregates(apiKey, ticker, fromDate, toDate)];
            case 73:
                aggResponse = _22.sent();
                if (!aggResponse.results || aggResponse.results.length === 0) {
                    console.log("[DataLoader] No results for ".concat(ticker));
                    tickersProcessed++;
                    return [3 /*break*/, 87];
                }
                // Insert each bar - commit per ticker to avoid large transactions
                // Note: Aggregates endpoint doesn't have change/change_pct/prevDay, so we insert NULL
                return [4 /*yield*/, client.query('BEGIN')];
            case 74:
                // Insert each bar - commit per ticker to avoid large transactions
                // Note: Aggregates endpoint doesn't have change/change_pct/prevDay, so we insert NULL
                _22.sent();
                _f = 0, _g = aggResponse.results;
                _22.label = 75;
            case 75:
                if (!(_f < _g.length)) return [3 /*break*/, 78];
                bar = _g[_f];
                barTradeDate = unixMsToDateString(bar.t);
                return [4 /*yield*/, client.query("\n                INSERT INTO price_history (trade_date, ticker, o, h, l, c, v, vw, change, change_pct,\n                                           prev_o, prev_h, prev_l, prev_c, prev_v, prev_vw)\n                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)\n                ON CONFLICT (trade_date, ticker) DO UPDATE SET\n                  o = EXCLUDED.o,\n                  h = EXCLUDED.h,\n                  l = EXCLUDED.l,\n                  c = EXCLUDED.c,\n                  v = EXCLUDED.v,\n                  vw = EXCLUDED.vw\n              ", [
                        barTradeDate,
                        ticker,
                        bar.o,
                        bar.h,
                        bar.l,
                        bar.c,
                        Math.round(bar.v), // Round volume to integer for BIGINT column
                        bar.vw,
                    ])];
            case 76:
                _22.sent();
                totalPricesInserted++;
                _22.label = 77;
            case 77:
                _f++;
                return [3 /*break*/, 75];
            case 78: return [4 /*yield*/, client.query('COMMIT')];
            case 79:
                _22.sent();
                tickersProcessed++;
                console.log("[DataLoader] ".concat(ticker, ": ").concat(aggResponse.resultsCount, " bars loaded (").concat(tickersProcessed, "/").concat(tickersToProcess.length, ")"));
                // Rate limiting: 100ms delay between API calls (~10 requests/second)
                return [4 /*yield*/, delay(100)];
            case 80:
                // Rate limiting: 100ms delay between API calls (~10 requests/second)
                _22.sent();
                return [3 /*break*/, 87];
            case 81:
                tickerError_1 = _22.sent();
                _22.label = 82;
            case 82:
                _22.trys.push([82, 84, , 85]);
                return [4 /*yield*/, client.query('ROLLBACK')];
            case 83:
                _22.sent();
                return [3 /*break*/, 85];
            case 84:
                _h = _22.sent();
                return [3 /*break*/, 85];
            case 85:
                tickersFailed++;
                failedTickers.push(ticker);
                console.error("[DataLoader] Error processing ".concat(ticker, ":"), tickerError_1 instanceof Error ? tickerError_1.message : tickerError_1);
                // Continue with next ticker instead of failing entire batch
                return [4 /*yield*/, delay(500)];
            case 86:
                // Continue with next ticker instead of failing entire batch
                _22.sent(); // Longer delay after error
                return [3 /*break*/, 87];
            case 87:
                _e++;
                return [3 /*break*/, 70];
            case 88: return [3 /*break*/, 90];
            case 89:
                client.release();
                return [7 /*endfinally*/];
            case 90:
                nextBatchStart = batchStart + tickersToProcess.length;
                hasMore = nextBatchStart < totalTickers;
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Batch complete: ".concat(tickersProcessed, " tickers processed, ").concat(tickersFailed, " failed. ").concat(hasMore ? "Next batch starts at ".concat(nextBatchStart) : 'All batches complete!'),
                        stats: {
                            tickersProcessed: tickersProcessed,
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
                    }];
            case 91:
                if (!(action === 'load-sma')) return [3 /*break*/, 107];
                tickersToLoad = event.tickers;
                if (!tickersToLoad || tickersToLoad.length === 0) {
                    return [2 /*return*/, {
                            success: false,
                            action: action,
                            message: 'tickers is required for load-sma action',
                        }];
                }
                return [4 /*yield*/, getPolygonApiKey()];
            case 92:
                apiKey = _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 93:
                client = _22.sent();
                smaRecordsInserted = 0;
                _22.label = 94;
            case 94:
                _22.trys.push([94, 103, 105, 106]);
                return [4 /*yield*/, client.query('BEGIN')];
            case 95:
                _22.sent();
                _j = 0, tickersToLoad_2 = tickersToLoad;
                _22.label = 96;
            case 96:
                if (!(_j < tickersToLoad_2.length)) return [3 /*break*/, 101];
                ticker = tickersToLoad_2[_j];
                return [4 /*yield*/, Promise.all([
                        fetchSMA(apiKey, ticker, tradeDate, 20),
                        fetchSMA(apiKey, ticker, tradeDate, 60),
                        fetchSMA(apiKey, ticker, tradeDate, 250),
                    ])];
            case 97:
                _k = _22.sent(), sma20Response = _k[0], sma60Response = _k[1], sma250Response = _k[2];
                sma20 = (_t = (_s = (_r = (_q = sma20Response.results) === null || _q === void 0 ? void 0 : _q.values) === null || _r === void 0 ? void 0 : _r[0]) === null || _s === void 0 ? void 0 : _s.value) !== null && _t !== void 0 ? _t : null;
                sma60 = (_x = (_w = (_v = (_u = sma60Response.results) === null || _u === void 0 ? void 0 : _u.values) === null || _v === void 0 ? void 0 : _v[0]) === null || _w === void 0 ? void 0 : _w.value) !== null && _x !== void 0 ? _x : null;
                sma250 = (_1 = (_0 = (_z = (_y = sma250Response.results) === null || _y === void 0 ? void 0 : _y.values) === null || _z === void 0 ? void 0 : _z[0]) === null || _0 === void 0 ? void 0 : _0.value) !== null && _1 !== void 0 ? _1 : null;
                smaTradeDate = ((_4 = (_3 = (_2 = sma20Response.results) === null || _2 === void 0 ? void 0 : _2.values) === null || _3 === void 0 ? void 0 : _3[0]) === null || _4 === void 0 ? void 0 : _4.timestamp)
                    ? unixMsToDateString(sma20Response.results.values[0].timestamp)
                    : tradeDate;
                console.log("[DataLoader] ".concat(ticker, " SMA values: 20=").concat(sma20, ", 60=").concat(sma60, ", 250=").concat(sma250, " for ").concat(smaTradeDate));
                // Upsert SMA record
                return [4 /*yield*/, client.query("\n            INSERT INTO sma (trade_date, ticker, sma_20, sma_60, sma_250, last_updated)\n            VALUES ($1, $2, $3, $4, $5, NOW())\n            ON CONFLICT (trade_date, ticker) DO UPDATE SET\n              sma_20 = EXCLUDED.sma_20,\n              sma_60 = EXCLUDED.sma_60,\n              sma_250 = EXCLUDED.sma_250,\n              last_updated = NOW()\n          ", [smaTradeDate, ticker, sma20, sma60, sma250])];
            case 98:
                // Upsert SMA record
                _22.sent();
                smaRecordsInserted++;
                // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
                return [4 /*yield*/, delay(300)];
            case 99:
                // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
                _22.sent();
                _22.label = 100;
            case 100:
                _j++;
                return [3 /*break*/, 96];
            case 101: return [4 /*yield*/, client.query('COMMIT')];
            case 102:
                _22.sent();
                console.log("[DataLoader] Successfully loaded ".concat(smaRecordsInserted, " SMA records"));
                return [3 /*break*/, 106];
            case 103:
                error_5 = _22.sent();
                return [4 /*yield*/, client.query('ROLLBACK')];
            case 104:
                _22.sent();
                throw error_5;
            case 105:
                client.release();
                return [7 /*endfinally*/];
            case 106: return [2 /*return*/, {
                    success: true,
                    action: action,
                    message: "Successfully loaded SMA data for ".concat(tickersToLoad.length, " ticker(s) on ").concat(tradeDate),
                    stats: {
                        tickersProcessed: tickersToLoad.length,
                        pricesInserted: smaRecordsInserted,
                    },
                }];
            case 107:
                if (!(action === 'load-russell-sma')) return [3 /*break*/, 123];
                batchStart = (_5 = event.batchStart) !== null && _5 !== void 0 ? _5 : 0;
                batchSize = (_6 = event.batchSize) !== null && _6 !== void 0 ? _6 : 50;
                return [4 /*yield*/, pool.query('SELECT ticker FROM russell_1000 ORDER BY ticker')];
            case 108:
                russellResult = _22.sent();
                allTickers = russellResult.rows.map(function (r) { return r.ticker; });
                totalTickers = allTickers.length;
                console.log("[DataLoader] Found ".concat(totalTickers, " Russell 1000 tickers for SMA loading"));
                tickersToProcess = allTickers.slice(batchStart, batchStart + batchSize);
                if (tickersToProcess.length === 0) {
                    return [2 /*return*/, {
                            success: true,
                            action: action,
                            message: "All ".concat(totalTickers, " Russell 1000 tickers have been processed for SMA"),
                            stats: {
                                tickersProcessed: 0,
                                pricesInserted: 0,
                            },
                        }];
                }
                console.log("[DataLoader] Processing SMA batch: tickers ".concat(batchStart, " to ").concat(batchStart + tickersToProcess.length - 1, " (").concat(tickersToProcess[0], " to ").concat(tickersToProcess[tickersToProcess.length - 1], ")"));
                return [4 /*yield*/, getPolygonApiKey()];
            case 109:
                apiKey = _22.sent();
                return [4 /*yield*/, pool.connect()];
            case 110:
                client = _22.sent();
                smaRecordsInserted = 0;
                tickersProcessed = 0;
                tickersFailed = 0;
                failedTickers = [];
                _22.label = 111;
            case 111:
                _22.trys.push([111, , 121, 122]);
                _l = 0, tickersToProcess_2 = tickersToProcess;
                _22.label = 112;
            case 112:
                if (!(_l < tickersToProcess_2.length)) return [3 /*break*/, 120];
                ticker = tickersToProcess_2[_l];
                _22.label = 113;
            case 113:
                _22.trys.push([113, 117, , 119]);
                return [4 /*yield*/, Promise.all([
                        fetchSMA(apiKey, ticker, tradeDate, 20),
                        fetchSMA(apiKey, ticker, tradeDate, 60),
                        fetchSMA(apiKey, ticker, tradeDate, 250),
                    ])];
            case 114:
                _m = _22.sent(), sma20Response = _m[0], sma60Response = _m[1], sma250Response = _m[2];
                sma20 = (_10 = (_9 = (_8 = (_7 = sma20Response.results) === null || _7 === void 0 ? void 0 : _7.values) === null || _8 === void 0 ? void 0 : _8[0]) === null || _9 === void 0 ? void 0 : _9.value) !== null && _10 !== void 0 ? _10 : null;
                sma60 = (_14 = (_13 = (_12 = (_11 = sma60Response.results) === null || _11 === void 0 ? void 0 : _11.values) === null || _12 === void 0 ? void 0 : _12[0]) === null || _13 === void 0 ? void 0 : _13.value) !== null && _14 !== void 0 ? _14 : null;
                sma250 = (_18 = (_17 = (_16 = (_15 = sma250Response.results) === null || _15 === void 0 ? void 0 : _15.values) === null || _16 === void 0 ? void 0 : _16[0]) === null || _17 === void 0 ? void 0 : _17.value) !== null && _18 !== void 0 ? _18 : null;
                smaTradeDate = ((_21 = (_20 = (_19 = sma20Response.results) === null || _19 === void 0 ? void 0 : _19.values) === null || _20 === void 0 ? void 0 : _20[0]) === null || _21 === void 0 ? void 0 : _21.timestamp)
                    ? unixMsToDateString(sma20Response.results.values[0].timestamp)
                    : tradeDate;
                // Upsert SMA record
                return [4 /*yield*/, client.query("\n              INSERT INTO sma (trade_date, ticker, sma_20, sma_60, sma_250, last_updated)\n              VALUES ($1, $2, $3, $4, $5, NOW())\n              ON CONFLICT (trade_date, ticker) DO UPDATE SET\n                sma_20 = EXCLUDED.sma_20,\n                sma_60 = EXCLUDED.sma_60,\n                sma_250 = EXCLUDED.sma_250,\n                last_updated = NOW()\n            ", [smaTradeDate, ticker, sma20, sma60, sma250])];
            case 115:
                // Upsert SMA record
                _22.sent();
                smaRecordsInserted++;
                tickersProcessed++;
                console.log("[DataLoader] ".concat(ticker, ": SMA(20)=").concat(sma20 === null || sma20 === void 0 ? void 0 : sma20.toFixed(2), ", SMA(60)=").concat(sma60 === null || sma60 === void 0 ? void 0 : sma60.toFixed(2), ", SMA(250)=").concat(sma250 === null || sma250 === void 0 ? void 0 : sma250.toFixed(2), " (").concat(tickersProcessed, "/").concat(tickersToProcess.length, ")"));
                // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
                return [4 /*yield*/, delay(300)];
            case 116:
                // Rate limiting: 300ms delay between ticker batches (3 API calls per ticker)
                _22.sent();
                return [3 /*break*/, 119];
            case 117:
                tickerError_2 = _22.sent();
                tickersFailed++;
                failedTickers.push(ticker);
                console.error("[DataLoader] Error processing SMA for ".concat(ticker, ":"), tickerError_2 instanceof Error ? tickerError_2.message : tickerError_2);
                // Continue with next ticker instead of failing entire batch
                return [4 /*yield*/, delay(500)];
            case 118:
                // Continue with next ticker instead of failing entire batch
                _22.sent(); // Longer delay after error
                return [3 /*break*/, 119];
            case 119:
                _l++;
                return [3 /*break*/, 112];
            case 120: return [3 /*break*/, 122];
            case 121:
                client.release();
                return [7 /*endfinally*/];
            case 122:
                nextBatchStart = batchStart + tickersToProcess.length;
                hasMore = nextBatchStart < totalTickers;
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "SMA Batch complete: ".concat(tickersProcessed, " tickers processed, ").concat(tickersFailed, " failed. ").concat(hasMore ? "Next batch starts at ".concat(nextBatchStart) : 'All batches complete!'),
                        stats: {
                            tickersProcessed: tickersProcessed,
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
                    }];
            case 123: return [2 /*return*/, {
                    success: false,
                    action: action,
                    message: "Unknown action: ".concat(action),
                }];
            case 124:
                error_6 = _22.sent();
                console.error('[DataLoader] Error:', error_6);
                // Throw the error so Step Functions can retry
                // This allows the retry configuration with exponential backoff to work
                throw error_6;
            case 125:
                if (!pool) return [3 /*break*/, 127];
                return [4 /*yield*/, pool.end()];
            case 126:
                _22.sent();
                _22.label = 127;
            case 127: return [7 /*endfinally*/];
            case 128: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
