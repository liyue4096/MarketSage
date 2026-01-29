"use strict";
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
var client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
var lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
var client = new client_dynamodb_1.DynamoDBClient({});
var docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
var TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';
// Transform DynamoDB record to frontend StockReport format
function transformToStockReport(record) {
    // Transform thesis points
    var transformThesis = function (thesis) {
        if (!(thesis === null || thesis === void 0 ? void 0 : thesis.thesis))
            return [];
        return thesis.thesis.map(function (t) { return ({
            point: t.point,
            evidence: t.evidence,
            source: t.source || t.dataDate,
            sourceUrl: undefined,
        }); });
    };
    // Transform peers to peer table format
    var transformPeers = function (peers) {
        if (!peers || peers.length === 0)
            return [];
        return peers.map(function (p, idx) { return ({
            ticker: p.ticker,
            companyName: p.companyName || p.ticker,
            price: p.price || 0,
            peRatio: p.peRatio || 0,
            rsi: 50, // Default values since we don't have these in DynamoDB
            volumeDelta: 1.0,
            relativePerfomance: idx === 0 ? 0 : -5 * idx,
        }); });
    };
    // Build appendix from thinking traces (full content, no truncation)
    var buildAppendix = function (bull, bear) {
        var parts = ['[AI THINKING TRACE]'];
        if (bull === null || bull === void 0 ? void 0 : bull.thinkingTrace) {
            parts.push('\n=== BULL AGENT ===');
            parts.push(bull.thinkingTrace);
        }
        if (bear === null || bear === void 0 ? void 0 : bear.thinkingTrace) {
            parts.push('\n=== BEAR AGENT ===');
            parts.push(bear.thinkingTrace);
        }
        return parts.join('\n');
    };
    // Map verdict to expected values
    var mapVerdict = function (v) {
        var lower = v.toLowerCase();
        if (lower.includes('buy') || lower.includes('bull'))
            return 'Strong Buy';
        if (lower.includes('short') || lower.includes('bear') || lower.includes('sell'))
            return 'Short';
        return 'Neutral';
    };
    // Determine breakthrough intensity based on trigger type
    var getIntensity = function (trigger) {
        if (trigger === '250MA')
            return 'High';
        if (trigger === '20MA')
            return 'Low';
        return 'Medium';
    };
    // Map trigger type to valid values
    var mapTriggerType = function (trigger) {
        if (trigger === '250MA')
            return '250MA';
        if (trigger === '20MA')
            return '20MA';
        return '60MA';
    };
    return {
        ticker: record.ticker,
        companyName: record.ticker, // TODO: Get from company lookup
        triggerDate: record.triggerDate,
        triggerType: mapTriggerType(record.triggerType),
        breakthroughIntensity: getIntensity(record.triggerType),
        verdict: mapVerdict(record.verdict),
        confidence: record.confidence,
        primaryCatalyst: record.primaryCatalyst || 'Technical Breakout',
        peerTable: transformPeers(record.peers),
        bullThesis: transformThesis(record.bullOpening),
        bearThesis: transformThesis(record.bearOpening),
        consensusSummary: record.consensusSummary || [],
        reportContent: record.reportContent || '',
        appendix: buildAppendix(record.bullOpening, record.bearOpening),
        thoughtSignature: record.thoughtSignature,
    };
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var httpMethod, path, pathParameters, queryStringParameters, headers, result, dates, date, result, reports, ticker, date, result, item, report, error_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                httpMethod = event.httpMethod, path = event.path, pathParameters = event.pathParameters, queryStringParameters = event.queryStringParameters;
                console.log("[ApiHandler] ".concat(httpMethod, " ").concat(path));
                headers = {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
                };
                _b.label = 1;
            case 1:
                _b.trys.push([1, 11, , 12]);
                // Health check
                if (path === '/health' || path === '/prod/health') {
                    return [2 /*return*/, {
                            statusCode: 200,
                            headers: headers,
                            body: JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
                        }];
                }
                if (!((path === '/dates' || path === '/prod/dates') && httpMethod === 'GET')) return [3 /*break*/, 3];
                return [4 /*yield*/, docClient.send(new lib_dynamodb_1.ScanCommand({
                        TableName: TABLE_NAME,
                        FilterExpression: 'entityType = :et',
                        ExpressionAttributeValues: {
                            ':et': 'ANALYSIS_REPORT',
                        },
                        ProjectionExpression: 'triggerDate',
                    }))];
            case 2:
                result = _b.sent();
                dates = __spreadArray([], new Set((result.Items || []).map(function (item) { return item.triggerDate; })), true).sort().reverse();
                return [2 /*return*/, {
                        statusCode: 200,
                        headers: headers,
                        body: JSON.stringify({ dates: dates }),
                    }];
            case 3:
                if (!((path === '/reports' || path === '/prod/reports') && httpMethod === 'GET')) return [3 /*break*/, 5];
                date = queryStringParameters === null || queryStringParameters === void 0 ? void 0 : queryStringParameters.date;
                if (!date) {
                    return [2 /*return*/, {
                            statusCode: 400,
                            headers: headers,
                            body: JSON.stringify({ error: 'date query parameter is required' }),
                        }];
                }
                return [4 /*yield*/, docClient.send(new lib_dynamodb_1.ScanCommand({
                        TableName: TABLE_NAME,
                        FilterExpression: 'triggerDate = :date AND entityType = :et',
                        ExpressionAttributeValues: {
                            ':date': date,
                            ':et': 'ANALYSIS_REPORT',
                        },
                    }))];
            case 4:
                result = _b.sent();
                reports = (result.Items || []).map(function (item) { return transformToStockReport(item); });
                return [2 /*return*/, {
                        statusCode: 200,
                        headers: headers,
                        body: JSON.stringify({ date: date, reports: reports }),
                    }];
            case 5:
                if (!((path.startsWith('/reports/') || path.startsWith('/prod/reports/')) && httpMethod === 'GET')) return [3 /*break*/, 10];
                ticker = (pathParameters === null || pathParameters === void 0 ? void 0 : pathParameters.ticker) || path.split('/').pop();
                date = queryStringParameters === null || queryStringParameters === void 0 ? void 0 : queryStringParameters.date;
                if (!ticker) {
                    return [2 /*return*/, {
                            statusCode: 400,
                            headers: headers,
                            body: JSON.stringify({ error: 'ticker is required' }),
                        }];
                }
                result = void 0;
                if (!date) return [3 /*break*/, 7];
                return [4 /*yield*/, docClient.send(new lib_dynamodb_1.QueryCommand({
                        TableName: TABLE_NAME,
                        IndexName: 'GSI2',
                        KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK = :sk',
                        ExpressionAttributeValues: {
                            ':pk': "TICKER#".concat(ticker),
                            ':sk': date,
                        },
                    }))];
            case 6:
                result = _b.sent();
                return [3 /*break*/, 9];
            case 7: return [4 /*yield*/, docClient.send(new lib_dynamodb_1.QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': "TICKER#".concat(ticker),
                    },
                    ScanIndexForward: false, // Most recent first
                    Limit: 1,
                }))];
            case 8:
                // Get most recent report for this ticker
                result = _b.sent();
                _b.label = 9;
            case 9:
                item = (_a = result.Items) === null || _a === void 0 ? void 0 : _a[0];
                if (!item) {
                    return [2 /*return*/, {
                            statusCode: 404,
                            headers: headers,
                            body: JSON.stringify({ error: 'Report not found', ticker: ticker, date: date }),
                        }];
                }
                report = transformToStockReport(item);
                return [2 /*return*/, {
                        statusCode: 200,
                        headers: headers,
                        body: JSON.stringify({ ticker: ticker, date: report.triggerDate, report: report }),
                    }];
            case 10: 
            // Route not found
            return [2 /*return*/, {
                    statusCode: 404,
                    headers: headers,
                    body: JSON.stringify({ error: 'Not Found', path: path }),
                }];
            case 11:
                error_1 = _b.sent();
                console.error('[ApiHandler] Error:', error_1);
                return [2 /*return*/, {
                        statusCode: 500,
                        headers: headers,
                        body: JSON.stringify({ error: 'Internal Server Error', message: error_1.message }),
                    }];
            case 12: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
