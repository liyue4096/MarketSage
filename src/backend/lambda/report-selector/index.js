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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
var client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
var client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
var util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
var pg_1 = require("pg");
// DynamoDB table name
var ANALYSIS_TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';
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
// Get date N days ago
function getDateNDaysAgo(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    var etOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    return date.toLocaleDateString('en-CA', etOptions);
}
// Get recently reported tickers from DynamoDB (last N days)
function getRecentlyReportedTickers(skipDays) {
    return __awaiter(this, void 0, void 0, function () {
        var client, cutoffDate, recentTickers, lastEvaluatedKey, result, _i, _a, item, unmarshalled;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    client = new client_dynamodb_1.DynamoDBClient({
                        region: process.env.AWS_REGION || 'us-west-2',
                    });
                    cutoffDate = getDateNDaysAgo(skipDays);
                    console.log("[ReportSelector] Looking for reports since ".concat(cutoffDate));
                    recentTickers = new Set();
                    _b.label = 1;
                case 1: return [4 /*yield*/, client.send(new client_dynamodb_1.ScanCommand({
                        TableName: ANALYSIS_TABLE_NAME,
                        FilterExpression: 'triggerDate >= :cutoffDate AND entityType = :entityType',
                        ExpressionAttributeValues: {
                            ':cutoffDate': { S: cutoffDate },
                            ':entityType': { S: 'ANALYSIS_REPORT' },
                        },
                        ProjectionExpression: 'ticker, triggerDate',
                        ExclusiveStartKey: lastEvaluatedKey,
                    }))];
                case 2:
                    result = _b.sent();
                    if (result.Items) {
                        for (_i = 0, _a = result.Items; _i < _a.length; _i++) {
                            item = _a[_i];
                            unmarshalled = (0, util_dynamodb_1.unmarshall)(item);
                            if (unmarshalled.ticker) {
                                recentTickers.add(unmarshalled.ticker);
                            }
                        }
                    }
                    lastEvaluatedKey = result.LastEvaluatedKey;
                    _b.label = 3;
                case 3:
                    if (lastEvaluatedKey) return [3 /*break*/, 1];
                    _b.label = 4;
                case 4:
                    console.log("[ReportSelector] Found ".concat(recentTickers.size, " tickers with recent reports"));
                    return [2 /*return*/, recentTickers];
            }
        });
    });
}
// Select tickers for reports
function selectTickers(pool, tradeDate, nasdaqLimit, russellLimit, skipTickers) {
    return __awaiter(this, void 0, void 0, function () {
        var client, skipTickersArray, skipTickersPlaceholder, nasdaqQuery, nasdaqParams, nasdaqResult, russellQuery, russellParams, russellResult, nasdaqTickers, russellTickers, nasdaqCountQuery, nasdaqCountResult, russellCountQuery, russellCountResult;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 7, 8]);
                    skipTickersArray = Array.from(skipTickers);
                    skipTickersPlaceholder = skipTickersArray.length > 0
                        ? skipTickersArray.map(function (_, i) { return "$".concat(i + 2); }).join(', ')
                        : "''";
                    nasdaqQuery = "\n      SELECT\n        n.ticker,\n        n.name,\n        n.weight,\n        ph.c AS close_price,\n        ph.change_pct AS price_change_pct,\n        s.ma_20_signal,\n        s.ma_60_signal,\n        s.ma_250_signal\n      FROM nasdaq_100 n\n      LEFT JOIN price_history ph ON n.ticker = ph.ticker AND ph.trade_date = $1\n      LEFT JOIN ma_signals s ON n.ticker = s.ticker AND s.signal_date = $1\n      WHERE n.ticker NOT IN (".concat(skipTickersPlaceholder, ")\n        AND (s.ma_20_signal IS NOT NULL OR s.ma_60_signal IS NOT NULL OR s.ma_250_signal IS NOT NULL)\n        AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')\n      ORDER BY n.weight DESC\n      LIMIT $").concat(skipTickersArray.length + 2, "\n    ");
                    nasdaqParams = __spreadArray(__spreadArray([tradeDate], skipTickersArray, true), [nasdaqLimit], false);
                    console.log("[ReportSelector] Querying Nasdaq 100 with limit ".concat(nasdaqLimit));
                    return [4 /*yield*/, client.query(nasdaqQuery, nasdaqParams)];
                case 3:
                    nasdaqResult = _a.sent();
                    console.log("[ReportSelector] Found ".concat(nasdaqResult.rows.length, " Nasdaq candidates"));
                    russellQuery = "\n      WITH signal_data AS (\n        SELECT\n          r.ticker,\n          r.name,\n          s.close_price,\n          s.price_change_pct,\n          s.ma_20_signal,\n          s.ma_60_signal,\n          s.ma_250_signal,\n          -- Count non-NONE signals\n          (CASE WHEN s.ma_20_signal != 'NONE' THEN 1 ELSE 0 END) +\n          (CASE WHEN s.ma_60_signal != 'NONE' THEN 1 ELSE 0 END) +\n          (CASE WHEN s.ma_250_signal != 'NONE' THEN 1 ELSE 0 END) AS signal_count,\n          -- Priority flags for ordering\n          CASE WHEN s.ma_250_signal != 'NONE' THEN 1 ELSE 0 END AS has_250_signal,\n          CASE WHEN s.ma_60_signal != 'NONE' THEN 1 ELSE 0 END AS has_60_signal,\n          CASE WHEN s.ma_20_signal != 'NONE' THEN 1 ELSE 0 END AS has_20_signal\n        FROM russell_1000 r\n        INNER JOIN ma_signals s ON r.ticker = s.ticker AND s.signal_date = $1\n        WHERE r.ticker NOT IN (SELECT ticker FROM nasdaq_100)\n          AND r.ticker NOT IN (".concat(skipTickersPlaceholder, ")\n          AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')\n      )\n      SELECT *\n      FROM signal_data\n      ORDER BY\n        signal_count DESC,\n        has_250_signal DESC,\n        has_60_signal DESC,\n        has_20_signal DESC,\n        price_change_pct DESC\n      LIMIT $").concat(skipTickersArray.length + 2, "\n    ");
                    russellParams = __spreadArray(__spreadArray([tradeDate], skipTickersArray, true), [russellLimit], false);
                    console.log("[ReportSelector] Querying Russell 1000 (non-Nasdaq) with limit ".concat(russellLimit));
                    return [4 /*yield*/, client.query(russellQuery, russellParams)];
                case 4:
                    russellResult = _a.sent();
                    console.log("[ReportSelector] Found ".concat(russellResult.rows.length, " Russell candidates"));
                    nasdaqTickers = nasdaqResult.rows.map(function (row) {
                        // Determine trigger type based on signals (prioritize 250 > 60 > 20)
                        var triggerType = '20MA';
                        if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
                            triggerType = '250MA';
                        }
                        else if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
                            triggerType = '60MA';
                        }
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
                            triggerType: triggerType,
                        };
                    });
                    russellTickers = russellResult.rows.map(function (row) {
                        // Determine trigger type based on signals (prioritize 250 > 60 > 20)
                        var triggerType = '20MA';
                        if (row.ma_250_signal && row.ma_250_signal !== 'NONE') {
                            triggerType = '250MA';
                        }
                        else if (row.ma_60_signal && row.ma_60_signal !== 'NONE') {
                            triggerType = '60MA';
                        }
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
                            triggerType: triggerType,
                        };
                    });
                    nasdaqCountQuery = "\n      SELECT COUNT(*) as count\n      FROM nasdaq_100 n\n      LEFT JOIN ma_signals s ON n.ticker = s.ticker AND s.signal_date = $1\n      WHERE (s.ma_20_signal IS NOT NULL AND s.ma_20_signal != 'NONE')\n         OR (s.ma_60_signal IS NOT NULL AND s.ma_60_signal != 'NONE')\n         OR (s.ma_250_signal IS NOT NULL AND s.ma_250_signal != 'NONE')\n    ";
                    return [4 /*yield*/, client.query(nasdaqCountQuery, [tradeDate])];
                case 5:
                    nasdaqCountResult = _a.sent();
                    russellCountQuery = "\n      SELECT COUNT(*) as count\n      FROM russell_1000 r\n      INNER JOIN ma_signals s ON r.ticker = s.ticker AND s.signal_date = $1\n      WHERE r.ticker NOT IN (SELECT ticker FROM nasdaq_100)\n        AND (s.ma_20_signal != 'NONE' OR s.ma_60_signal != 'NONE' OR s.ma_250_signal != 'NONE')\n    ";
                    return [4 /*yield*/, client.query(russellCountQuery, [tradeDate])];
                case 6:
                    russellCountResult = _a.sent();
                    return [2 /*return*/, {
                            nasdaq: nasdaqTickers,
                            russell: russellTickers,
                            stats: {
                                nasdaqCandidates: parseInt(nasdaqCountResult.rows[0].count),
                                russellCandidates: parseInt(russellCountResult.rows[0].count),
                                skippedTickers: skipTickersArray,
                                selectedNasdaq: nasdaqTickers.length,
                                selectedRussell: russellTickers.length,
                            },
                        }];
                case 7:
                    client.release();
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    });
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var action, tradeDate, nasdaqLimit, russellLimit, skipDays, pool, recentTickers, skipTickers, _a, nasdaq, russell, stats, selectedTickers, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                action = event.action || 'select-tickers';
                tradeDate = event.tradeDate || getCurrentTradingDay();
                nasdaqLimit = event.nasdaqLimit !== undefined ? event.nasdaqLimit : 4;
                russellLimit = event.russellLimit !== undefined ? event.russellLimit : 4;
                skipDays = event.skipDays !== undefined ? event.skipDays : 14;
                console.log("[ReportSelector] Starting with action: ".concat(action, ", tradeDate: ").concat(tradeDate));
                console.log("[ReportSelector] Limits: nasdaq=".concat(nasdaqLimit, ", russell=").concat(russellLimit, ", skipDays=").concat(skipDays));
                pool = null;
                _b.label = 1;
            case 1:
                _b.trys.push([1, 8, 9, 12]);
                if (!(action === 'get-recent-reports')) return [3 /*break*/, 3];
                return [4 /*yield*/, getRecentlyReportedTickers(skipDays)];
            case 2:
                recentTickers = _b.sent();
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Found ".concat(recentTickers.size, " tickers with reports in the last ").concat(skipDays, " days"),
                        recentReports: Array.from(recentTickers).map(function (ticker) { return ({ ticker: ticker, date: 'within last ' + skipDays + ' days' }); }),
                    }];
            case 3:
                if (!(action === 'select-tickers')) return [3 /*break*/, 7];
                return [4 /*yield*/, getRecentlyReportedTickers(skipDays)];
            case 4:
                skipTickers = _b.sent();
                return [4 /*yield*/, getDbPool()];
            case 5:
                // Step 2: Connect to database
                pool = _b.sent();
                return [4 /*yield*/, selectTickers(pool, tradeDate, nasdaqLimit, russellLimit, skipTickers)];
            case 6:
                _a = _b.sent(), nasdaq = _a.nasdaq, russell = _a.russell, stats = _a.stats;
                selectedTickers = __spreadArray(__spreadArray([], nasdaq, true), russell, true);
                console.log("[ReportSelector] Selected ".concat(selectedTickers.length, " tickers total"));
                console.log("[ReportSelector] Nasdaq: ".concat(nasdaq.map(function (t) { return t.ticker; }).join(', ')));
                console.log("[ReportSelector] Russell: ".concat(russell.map(function (t) { return t.ticker; }).join(', ')));
                return [2 /*return*/, {
                        success: true,
                        action: action,
                        message: "Selected ".concat(selectedTickers.length, " tickers for reports (").concat(nasdaq.length, " Nasdaq, ").concat(russell.length, " Russell)"),
                        tradeDate: tradeDate,
                        selectedTickers: selectedTickers,
                        stats: stats,
                    }];
            case 7: return [2 /*return*/, {
                    success: false,
                    action: action,
                    message: "Unknown action: ".concat(action, ". Valid actions: select-tickers, get-recent-reports"),
                }];
            case 8:
                error_1 = _b.sent();
                console.error('[ReportSelector] Error:', error_1);
                return [2 /*return*/, {
                        success: false,
                        action: action,
                        message: "Error: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)),
                    }];
            case 9:
                if (!pool) return [3 /*break*/, 11];
                return [4 /*yield*/, pool.end()];
            case 10:
                _b.sent();
                _b.label = 11;
            case 11: return [7 /*endfinally*/];
            case 12: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
