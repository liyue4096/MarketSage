"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const client = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const s3Client = new client_s3_1.S3Client({});
const TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';
const COMPANY_DESC_TABLE = process.env.COMPANY_DESCRIPTIONS_TABLE || 'marketsage-company-descriptions';
const SIGNALS_TABLE = process.env.SIGNALS_TABLE_NAME || 'marketsage-signals';
const REPORTS_BUCKET = process.env.REPORTS_BUCKET_NAME || '';
// Map signal direction from DynamoDB/database format to frontend format
function mapSignalDirection(signal) {
    if (signal === 'CROSS_ABOVE' || signal === 'UP')
        return 'UP';
    if (signal === 'CROSS_BELOW' || signal === 'DOWN')
        return 'DOWN';
    return 'NONE';
}
// Fetch company descriptions from DynamoDB (more reliable than Aurora - no sleep/wake delay)
// Returns empty Map on error (graceful degradation - descriptions are optional)
async function fetchCompanyDescriptions(tickers) {
    if (tickers.length === 0)
        return new Map();
    // Deduplicate tickers - BatchGetItem rejects duplicate keys
    const uniqueTickers = [...new Set(tickers)];
    try {
        const descMap = new Map();
        // DynamoDB BatchGetItem has a limit of 100 items per request
        const BATCH_SIZE = 100;
        for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
            const batch = uniqueTickers.slice(i, i + BATCH_SIZE);
            const result = await docClient.send(new lib_dynamodb_1.BatchGetCommand({
                RequestItems: {
                    [COMPANY_DESC_TABLE]: {
                        Keys: batch.map(ticker => ({ ticker })),
                        ProjectionExpression: 'ticker, description',
                    },
                },
            }));
            const items = result.Responses?.[COMPANY_DESC_TABLE] || [];
            for (const item of items) {
                if (item.ticker && item.description) {
                    descMap.set(item.ticker, item.description);
                }
            }
        }
        return descMap;
    }
    catch (error) {
        // Graceful degradation: if DynamoDB fails, skip descriptions
        console.warn('[ApiHandler] Failed to fetch company descriptions from DynamoDB:', error.message);
        return new Map();
    }
}
// Transform DynamoDB record to frontend StockReport format
function transformToStockReport(record, companyDescription) {
    // Transform thesis points
    const transformThesis = (thesis) => {
        if (!thesis?.thesis)
            return [];
        return thesis.thesis.map((t) => ({
            point: t.point,
            evidence: t.evidence,
            source: t.source || t.dataDate,
            sourceUrl: undefined,
        }));
    };
    // Transform rebuttals
    const transformRebuttals = (rebuttals) => {
        if (!rebuttals)
            return undefined;
        return {
            bullRebuttals: (rebuttals.bullRebuttals || []).map((r) => ({
                originalPoint: r.originalPoint,
                rebuttal: r.rebuttal,
                evidence: r.evidence,
                source: r.source,
                dataDate: r.dataDate,
                strengthOfRebuttal: r.strengthOfRebuttal,
            })),
            bearRebuttals: (rebuttals.bearRebuttals || []).map((r) => ({
                originalPoint: r.originalPoint,
                rebuttal: r.rebuttal,
                evidence: r.evidence,
                source: r.source,
                dataDate: r.dataDate,
                strengthOfRebuttal: r.strengthOfRebuttal,
            })),
        };
    };
    // Transform peers to peer table format
    const transformPeers = (peers) => {
        if (!peers || peers.length === 0)
            return [];
        return peers.map((p, idx) => ({
            ticker: p.ticker,
            companyName: p.companyName || p.ticker,
            price: p.price || 0,
            peRatio: p.peRatio || 0,
            rsi: 50, // Default values since we don't have these in DynamoDB
            volumeDelta: 1.0,
            relativePerfomance: idx === 0 ? 0 : -5 * idx,
        }));
    };
    // Build appendix from thinking traces (full content, no truncation)
    const buildAppendix = (bull, bear) => {
        const parts = ['[AI THINKING TRACE]'];
        if (bull?.thinkingTrace) {
            parts.push('\n=== BULL AGENT ===');
            parts.push(bull.thinkingTrace);
        }
        if (bear?.thinkingTrace) {
            parts.push('\n=== BEAR AGENT ===');
            parts.push(bear.thinkingTrace);
        }
        return parts.join('\n');
    };
    // Map verdict to expected values
    const mapVerdict = (v) => {
        const lower = v.toLowerCase();
        if (lower.includes('buy') || lower.includes('bull'))
            return 'Strong Buy';
        if (lower.includes('short') || lower.includes('bear') || lower.includes('sell'))
            return 'Short';
        return 'Neutral';
    };
    // Determine breakthrough intensity based on trigger type
    const getIntensity = (trigger) => {
        if (trigger === '250MA')
            return 'High';
        if (trigger === '20MA')
            return 'Low';
        return 'Medium';
    };
    // Map trigger type to valid values
    const mapTriggerType = (trigger) => {
        if (trigger === '250MA')
            return '250MA';
        if (trigger === '20MA')
            return '20MA';
        return '60MA';
    };
    return {
        ticker: record.ticker,
        companyName: record.companyName || record.ticker, // Use stored company name
        companyDescription, // Brief intro from russell_1000
        triggerDate: record.triggerDate,
        triggerType: mapTriggerType(record.triggerType),
        activeSignals: record.activeSignals?.map(s => mapTriggerType(s)) || [mapTriggerType(record.triggerType)],
        breakthroughIntensity: getIntensity(record.triggerType),
        verdict: mapVerdict(record.verdict),
        confidence: record.confidence,
        primaryCatalyst: record.primaryCatalyst || 'Technical Breakout',
        peerTable: transformPeers(record.peers),
        // Round 1: Opening Arguments
        bullThesis: transformThesis(record.bullOpening),
        bearThesis: transformThesis(record.bearOpening),
        // Round 2: Rebuttals
        rebuttals: transformRebuttals(record.rebuttals),
        // Round 3: Final Defense
        bullDefense: record.bullDefense ? transformThesis(record.bullDefense) : undefined,
        bearDefense: record.bearDefense ? transformThesis(record.bearDefense) : undefined,
        // Conclusion
        consensusSummary: record.consensusSummary || [],
        reportContent: record.reportContent || '',
        // Chinese translations
        reportContentChinese: record.reportContentChinese,
        consensusSummaryChinese: record.consensusSummaryChinese,
        bullThesisChinese: record.bullOpeningChinese ? transformThesis(record.bullOpeningChinese) : undefined,
        bearThesisChinese: record.bearOpeningChinese ? transformThesis(record.bearOpeningChinese) : undefined,
        rebuttalsChinese: record.rebuttalsChinese ? transformRebuttals(record.rebuttalsChinese) : undefined,
        appendix: buildAppendix(record.bullOpening, record.bearOpening),
        thoughtSignature: record.thoughtSignature,
    };
}
const handler = async (event) => {
    const { httpMethod, path, pathParameters, queryStringParameters } = event;
    console.log(`[ApiHandler] ${httpMethod} ${path}`);
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    };
    try {
        // Health check
        if (path === '/health' || path === '/prod/health') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
            };
        }
        // Get available dates
        if ((path === '/dates' || path === '/prod/dates') && httpMethod === 'GET') {
            // Scan for distinct dates (using entityType to filter)
            const result = await docClient.send(new lib_dynamodb_1.ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'entityType = :et',
                ExpressionAttributeValues: {
                    ':et': 'ANALYSIS_REPORT',
                },
                ProjectionExpression: 'triggerDate',
            }));
            const dates = [...new Set((result.Items || []).map((item) => item.triggerDate))].sort().reverse();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ dates }),
            };
        }
        // Get reports for a date
        if ((path === '/reports' || path === '/prod/reports') && httpMethod === 'GET') {
            const date = queryStringParameters?.date;
            if (!date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'date query parameter is required' }),
                };
            }
            // Scan for reports on this date (with pagination to handle 1MB limit)
            const allItems = [];
            let lastEvaluatedKey;
            do {
                const result = await docClient.send(new lib_dynamodb_1.ScanCommand({
                    TableName: TABLE_NAME,
                    FilterExpression: 'triggerDate = :date AND entityType = :et',
                    ExpressionAttributeValues: {
                        ':date': date,
                        ':et': 'ANALYSIS_REPORT',
                    },
                    ExclusiveStartKey: lastEvaluatedKey,
                }));
                if (result.Items) {
                    allItems.push(...result.Items);
                }
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);
            // Fetch company descriptions for all tickers
            const tickers = allItems.map((item) => item.ticker);
            const descriptions = await fetchCompanyDescriptions(tickers);
            const reports = allItems.map((item) => {
                const record = item;
                return transformToStockReport(record, descriptions.get(record.ticker));
            });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ date, reports }),
            };
        }
        // Download full report from S3 (presigned URL)
        // Pattern: /reports/{ticker}/download?date=YYYY-MM-DD
        // IMPORTANT: Must be matched BEFORE the generic /reports/{ticker} route
        if ((path.match(/\/reports\/[^/]+\/download$/) || path.match(/\/prod\/reports\/[^/]+\/download$/)) && httpMethod === 'GET') {
            const ticker = path.split('/').slice(-2)[0];
            const date = queryStringParameters?.date;
            if (!ticker || !date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ticker (in path) and date (query param) are required' }),
                };
            }
            if (!REPORTS_BUCKET) {
                return {
                    statusCode: 503,
                    headers,
                    body: JSON.stringify({ error: 'Report downloads not configured' }),
                };
            }
            // Try .md first (new format), fall back to .json (legacy)
            let s3Key = `${date}/${ticker}.md`;
            try {
                await s3Client.send(new client_s3_1.HeadObjectCommand({ Bucket: REPORTS_BUCKET, Key: s3Key }));
            }
            catch {
                s3Key = `${date}/${ticker}.json`;
                try {
                    await s3Client.send(new client_s3_1.HeadObjectCommand({ Bucket: REPORTS_BUCKET, Key: s3Key }));
                }
                catch {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Report not found', ticker, date }),
                    };
                }
            }
            console.log(`[ApiHandler] Generating presigned URL for s3://${REPORTS_BUCKET}/${s3Key}`);
            try {
                const isMd = s3Key.endsWith('.md');
                const command = new client_s3_1.GetObjectCommand({
                    Bucket: REPORTS_BUCKET,
                    Key: s3Key,
                    ResponseContentDisposition: `attachment; filename="${ticker}_${date}_report.${isMd ? 'md' : 'json'}"`,
                    ResponseContentType: isMd ? 'text/markdown' : 'application/json',
                });
                const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, { expiresIn: 300 });
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        ticker,
                        date,
                        downloadUrl: presignedUrl,
                        expiresIn: 300,
                    }),
                };
            }
            catch (error) {
                console.error(`[ApiHandler] Error generating presigned URL:`, error);
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Report not found', ticker, date }),
                };
            }
        }
        // Get specific report by ticker
        if ((path.startsWith('/reports/') || path.startsWith('/prod/reports/')) && httpMethod === 'GET') {
            const ticker = pathParameters?.ticker || path.split('/').pop();
            const date = queryStringParameters?.date;
            if (!ticker) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ticker is required' }),
                };
            }
            // Query using GSI2 (TICKER#ticker, date) if date is provided, otherwise scan
            let result;
            if (date) {
                result = await docClient.send(new lib_dynamodb_1.QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK = :sk',
                    ExpressionAttributeValues: {
                        ':pk': `TICKER#${ticker}`,
                        ':sk': date,
                    },
                }));
            }
            else {
                // Get most recent report for this ticker
                result = await docClient.send(new lib_dynamodb_1.QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2',
                    KeyConditionExpression: 'GSI2PK = :pk',
                    ExpressionAttributeValues: {
                        ':pk': `TICKER#${ticker}`,
                    },
                    ScanIndexForward: false, // Most recent first
                    Limit: 1,
                }));
            }
            const item = result.Items?.[0];
            if (!item) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Report not found', ticker, date }),
                };
            }
            // Fetch company description
            const descriptions = await fetchCompanyDescriptions([ticker]);
            const report = transformToStockReport(item, descriptions.get(ticker));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ ticker, date: report.triggerDate, report }),
            };
        }
        // Get available signal dates (from DynamoDB - instant, no Aurora cold start)
        if ((path === '/signals/dates' || path === '/prod/signals/dates') && httpMethod === 'GET') {
            console.log('[ApiHandler] Fetching signal dates from DynamoDB');
            const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: SIGNALS_TABLE,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': 'SIGNAL_DATES' },
                ScanIndexForward: false,
                Limit: 90,
            }));
            const dates = (result.Items || []).map(item => item.SK);
            console.log(`[ApiHandler] Found ${dates.length} signal dates`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ dates }),
            };
        }
        // Get signals for a specific date (from DynamoDB - instant, no Aurora cold start)
        if ((path === '/signals' || path === '/prod/signals') && httpMethod === 'GET') {
            const date = queryStringParameters?.date;
            if (!date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'date query parameter is required' }),
                };
            }
            console.log(`[ApiHandler] Fetching signals for date: ${date} from DynamoDB`);
            const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: SIGNALS_TABLE,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': `DATE#${date}` },
            }));
            const signals = (result.Items || []).map((item) => ({
                ticker: item.SK,
                companyName: item.companyName ?? undefined,
                signalDate: date,
                closePrice: item.closePrice,
                priceChangePct: item.priceChangePct,
                ma20Signal: mapSignalDirection(item.ma20Signal),
                ma60Signal: mapSignalDirection(item.ma60Signal),
                ma250Signal: mapSignalDirection(item.ma250Signal),
                source: item.source ?? undefined,
            }));
            console.log(`[ApiHandler] Found ${signals.length} signals for ${date}`);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ date, signals }),
            };
        }
        // Route not found
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not Found', path }),
        };
    }
    catch (error) {
        console.error('[ApiHandler] Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', message: error.message }),
        };
    }
};
exports.handler = handler;
