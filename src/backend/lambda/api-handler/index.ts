import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';
const COMPANY_DESC_TABLE = process.env.COMPANY_DESCRIPTIONS_TABLE || 'marketsage-company-descriptions';
const SIGNALS_TABLE = process.env.SIGNALS_TABLE_NAME || 'marketsage-signals';
const REPORTS_BUCKET = process.env.REPORTS_BUCKET_NAME || '';

// Signal types for API response
interface MASignalResponse {
  ticker: string;
  companyName?: string;
  signalDate: string;
  closePrice: number;
  priceChangePct: number;
  ma20Signal: 'UP' | 'DOWN' | 'NONE';
  ma60Signal: 'UP' | 'DOWN' | 'NONE';
  ma250Signal: 'UP' | 'DOWN' | 'NONE';
  source?: 'nasdaq_100' | 'russell_1000';
}

// Map signal direction from DynamoDB/database format to frontend format
function mapSignalDirection(signal: string | null | undefined): 'UP' | 'DOWN' | 'NONE' {
  if (signal === 'CROSS_ABOVE' || signal === 'UP') return 'UP';
  if (signal === 'CROSS_BELOW' || signal === 'DOWN') return 'DOWN';
  return 'NONE';
}

// Types matching DynamoDB structure
interface DynamoThesisPoint {
  point: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  confidence?: number;
}

interface DynamoThesis {
  thesis: DynamoThesisPoint[];
  primaryRisk?: string;
  primaryCatalyst?: string;
  thinkingTrace?: string;
}

interface DynamoRebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  strengthOfRebuttal: number;
}

interface DynamoRebuttals {
  bullRebuttals: DynamoRebuttalPoint[];
  bearRebuttals: DynamoRebuttalPoint[];
  thinkingTrace?: string;
}

interface DynamoAnalysisRecord {
  ticker: string;
  companyName?: string;
  triggerDate: string;
  triggerType: string;
  activeSignals?: string[];
  closePrice: number;
  verdict: string;
  confidence: number;
  primaryCatalyst: string;
  consensusSummary: string[];
  reportContent: string;
  // Chinese translations
  reportContentChinese?: string;
  consensusSummaryChinese?: string[];
  thoughtSignature: string;
  bullOpening?: DynamoThesis;
  bearOpening?: DynamoThesis;
  rebuttals?: DynamoRebuttals;
  bullDefense?: DynamoThesis;
  bearDefense?: DynamoThesis;
  // Chinese translations for Opening Arguments and Cross-Examination
  bullOpeningChinese?: DynamoThesis;
  bearOpeningChinese?: DynamoThesis;
  rebuttalsChinese?: DynamoRebuttals;
  peers?: Array<{
    ticker: string;
    companyName: string;
    price?: number;
    peRatio?: number;
  }>;
  createdAt: string;
}

// Types matching frontend StockReport interface
interface PeerMetric {
  ticker: string;
  companyName: string;
  price: number;
  peRatio: number;
  rsi: number;
  volumeDelta: number;
  relativePerfomance: number;
}

interface DebatePoint {
  point: string;
  evidence: string;
  source?: string;
  sourceUrl?: string;
}

interface RebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  strengthOfRebuttal: number;
}

interface Rebuttals {
  bullRebuttals: RebuttalPoint[];
  bearRebuttals: RebuttalPoint[];
}

interface StockReport {
  ticker: string;
  companyName: string;
  companyDescription?: string; // Brief intro from russell_1000
  triggerDate: string;
  triggerType: '20MA' | '60MA' | '250MA';
  activeSignals?: ('20MA' | '60MA' | '250MA')[];
  breakthroughIntensity: 'Low' | 'Medium' | 'High';
  verdict: 'Strong Buy' | 'Neutral' | 'Short';
  confidence: number;
  primaryCatalyst: string;
  peerTable: PeerMetric[];
  // Round 1: Opening Arguments
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
  // Round 2: Rebuttals
  rebuttals?: Rebuttals;
  // Round 3: Final Defense
  bullDefense?: DebatePoint[];
  bearDefense?: DebatePoint[];
  // Conclusion
  consensusSummary: string[];
  reportContent: string;
  // Chinese translations
  reportContentChinese?: string;
  consensusSummaryChinese?: string[];
  bullThesisChinese?: DebatePoint[];
  bearThesisChinese?: DebatePoint[];
  rebuttalsChinese?: Rebuttals;
  appendix: string;
  thoughtSignature: string;
}

// Fetch company descriptions from DynamoDB (more reliable than Aurora - no sleep/wake delay)
// Returns empty Map on error (graceful degradation - descriptions are optional)
async function fetchCompanyDescriptions(tickers: string[]): Promise<Map<string, string>> {
  if (tickers.length === 0) return new Map();

  // Deduplicate tickers - BatchGetItem rejects duplicate keys
  const uniqueTickers = [...new Set(tickers)];

  try {
    const descMap = new Map<string, string>();

    // DynamoDB BatchGetItem has a limit of 100 items per request
    const BATCH_SIZE = 100;
    for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
      const batch = uniqueTickers.slice(i, i + BATCH_SIZE);

      const result = await docClient.send(new BatchGetCommand({
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
          descMap.set(item.ticker as string, item.description as string);
        }
      }
    }

    return descMap;
  } catch (error) {
    // Graceful degradation: if DynamoDB fails, skip descriptions
    console.warn('[ApiHandler] Failed to fetch company descriptions from DynamoDB:', (error as Error).message);
    return new Map();
  }
}

// Transform DynamoDB record to frontend StockReport format
function transformToStockReport(record: DynamoAnalysisRecord, companyDescription?: string): StockReport {
  // Transform thesis points
  const transformThesis = (thesis?: DynamoThesis): DebatePoint[] => {
    if (!thesis?.thesis) return [];
    return thesis.thesis.map((t) => ({
      point: t.point,
      evidence: t.evidence,
      source: t.source || t.dataDate,
      sourceUrl: undefined,
    }));
  };

  // Transform rebuttals
  const transformRebuttals = (rebuttals?: DynamoRebuttals): Rebuttals | undefined => {
    if (!rebuttals) return undefined;
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
  const transformPeers = (peers?: DynamoAnalysisRecord['peers']): PeerMetric[] => {
    if (!peers || peers.length === 0) return [];
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
  const buildAppendix = (bull?: DynamoThesis, bear?: DynamoThesis): string => {
    const parts: string[] = ['[AI THINKING TRACE]'];
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
  const mapVerdict = (v: string): 'Strong Buy' | 'Neutral' | 'Short' => {
    const lower = v.toLowerCase();
    if (lower.includes('buy') || lower.includes('bull')) return 'Strong Buy';
    if (lower.includes('short') || lower.includes('bear') || lower.includes('sell')) return 'Short';
    return 'Neutral';
  };

  // Determine breakthrough intensity based on trigger type
  const getIntensity = (trigger: string): 'Low' | 'Medium' | 'High' => {
    if (trigger === '250MA') return 'High';
    if (trigger === '20MA') return 'Low';
    return 'Medium';
  };

  // Map trigger type to valid values
  const mapTriggerType = (trigger: string): '20MA' | '60MA' | '250MA' => {
    if (trigger === '250MA') return '250MA';
    if (trigger === '20MA') return '20MA';
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

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
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
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'entityType = :et',
        ExpressionAttributeValues: {
          ':et': 'ANALYSIS_REPORT',
        },
        ProjectionExpression: 'triggerDate',
      }));

      const dates = [...new Set((result.Items || []).map((item) => item.triggerDate as string))].sort().reverse();

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
      const allItems: Record<string, unknown>[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const result = await docClient.send(new ScanCommand({
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
      const tickers = allItems.map((item) => (item as unknown as DynamoAnalysisRecord).ticker);
      const descriptions = await fetchCompanyDescriptions(tickers);

      const reports = allItems.map((item) => {
        const record = item as unknown as DynamoAnalysisRecord;
        return transformToStockReport(record, descriptions.get(record.ticker));
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ date, reports }),
      };
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
        result = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `TICKER#${ticker}`,
            ':sk': date,
          },
        }));
      } else {
        // Get most recent report for this ticker
        result = await docClient.send(new QueryCommand({
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
      const report = transformToStockReport(item as unknown as DynamoAnalysisRecord, descriptions.get(ticker));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ticker, date: report.triggerDate, report }),
      };
    }

    // Get available signal dates (from DynamoDB - instant, no Aurora cold start)
    if ((path === '/signals/dates' || path === '/prod/signals/dates') && httpMethod === 'GET') {
      console.log('[ApiHandler] Fetching signal dates from DynamoDB');

      const result = await docClient.send(new QueryCommand({
        TableName: SIGNALS_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'SIGNAL_DATES' },
        ScanIndexForward: false,
        Limit: 90,
      }));

      const dates = (result.Items || []).map(item => item.SK as string);
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

      const result = await docClient.send(new QueryCommand({
        TableName: SIGNALS_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `DATE#${date}` },
      }));

      const signals: MASignalResponse[] = (result.Items || []).map((item) => ({
        ticker: item.SK as string,
        companyName: (item.companyName as string) ?? undefined,
        signalDate: date,
        closePrice: item.closePrice as number,
        priceChangePct: item.priceChangePct as number,
        ma20Signal: mapSignalDirection(item.ma20Signal as string),
        ma60Signal: mapSignalDirection(item.ma60Signal as string),
        ma250Signal: mapSignalDirection(item.ma250Signal as string),
        source: (item.source as 'nasdaq_100' | 'russell_1000') ?? undefined,
      }));

      console.log(`[ApiHandler] Found ${signals.length} signals for ${date}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ date, signals }),
      };
    }

    // Download full report from S3 (presigned URL)
    // Pattern: /reports/{ticker}/download?date=YYYY-MM-DD
    if ((path.match(/\/reports\/[^/]+\/download$/) || path.match(/\/prod\/reports\/[^/]+\/download$/)) && httpMethod === 'GET') {
      const ticker = path.split('/').slice(-2)[0]; // Extract ticker from path
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

      const s3Key = `${date}/${ticker}.md`;
      console.log(`[ApiHandler] Generating presigned URL for s3://${REPORTS_BUCKET}/${s3Key}`);

      try {
        const command = new GetObjectCommand({
          Bucket: REPORTS_BUCKET,
          Key: s3Key,
          ResponseContentDisposition: `attachment; filename="${ticker}_${date}_report.md"`,
          ResponseContentType: 'text/markdown',
        });

        // Generate presigned URL valid for 5 minutes
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

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
      } catch (error) {
        console.error(`[ApiHandler] Error generating presigned URL:`, error);
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Report not found', ticker, date }),
        };
      }
    }

    // Route not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not Found', path }),
    };
  } catch (error) {
    console.error('[ApiHandler] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error', message: (error as Error).message }),
    };
  }
};
