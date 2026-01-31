import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const secretsClient = new SecretsManagerClient({});

const TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';

// PostgreSQL pool (lazy initialized)
let pgPool: Pool | null = null;

// Get PostgreSQL connection pool
async function getDbPool(): Promise<Pool> {
  if (pgPool) return pgPool;

  const secretName = process.env.DB_SECRET_ARN || 'marketsage/aurora/credentials';
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString || '{}');

  pgPool = new Pool({
    host: secret.host || process.env.DB_CLUSTER_ENDPOINT,
    port: secret.port || 5432,
    database: secret.dbname || process.env.DB_NAME || 'marketsage',
    user: secret.username,
    password: secret.password,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });

  return pgPool;
}

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

// Map database signal to frontend format
function mapSignalDirection(signal: string | null): 'UP' | 'DOWN' | 'NONE' {
  if (signal === 'CROSS_ABOVE') return 'UP';
  if (signal === 'CROSS_BELOW') return 'DOWN';
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
  triggerDate: string;
  triggerType: '20MA' | '60MA' | '250MA';
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
  appendix: string;
  thoughtSignature: string;
}

// Transform DynamoDB record to frontend StockReport format
function transformToStockReport(record: DynamoAnalysisRecord): StockReport {
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
    triggerDate: record.triggerDate,
    triggerType: mapTriggerType(record.triggerType),
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

      // Scan for reports on this date
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'triggerDate = :date AND entityType = :et',
        ExpressionAttributeValues: {
          ':date': date,
          ':et': 'ANALYSIS_REPORT',
        },
      }));

      const reports = (result.Items || []).map((item) => transformToStockReport(item as unknown as DynamoAnalysisRecord));

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

      const report = transformToStockReport(item as unknown as DynamoAnalysisRecord);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ticker, date: report.triggerDate, report }),
      };
    }

    // Get available signal dates
    if ((path === '/signals/dates' || path === '/prod/signals/dates') && httpMethod === 'GET') {
      console.log('[ApiHandler] Fetching signal dates');
      const pool = await getDbPool();
      const result = await pool.query(`
        SELECT DISTINCT signal_date::text
        FROM ma_signals
        ORDER BY signal_date DESC
        LIMIT 90
      `);

      const dates = result.rows.map((row) => row.signal_date);
      console.log(`[ApiHandler] Found ${dates.length} signal dates`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ dates }),
      };
    }

    // Get signals for a specific date
    if ((path === '/signals' || path === '/prod/signals') && httpMethod === 'GET') {
      const date = queryStringParameters?.date;

      if (!date) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'date query parameter is required' }),
        };
      }

      console.log(`[ApiHandler] Fetching signals for date: ${date}`);
      const pool = await getDbPool();

      // Join with nasdaq_100 and russell_1000 to get company name and source
      const result = await pool.query(`
        SELECT
          s.signal_date::text,
          s.ticker,
          COALESCE(n.name, r.name) as company_name,
          s.close_price::float,
          s.price_change_pct::float,
          s.ma_20_signal,
          s.ma_60_signal,
          s.ma_250_signal,
          CASE
            WHEN n.ticker IS NOT NULL THEN 'nasdaq_100'
            WHEN r.ticker IS NOT NULL THEN 'russell_1000'
            ELSE NULL
          END as source
        FROM ma_signals s
        LEFT JOIN nasdaq_100 n ON s.ticker = n.ticker
        LEFT JOIN russell_1000 r ON s.ticker = r.ticker AND n.ticker IS NULL
        WHERE s.signal_date = $1
        ORDER BY s.price_change_pct DESC
      `, [date]);

      const signals: MASignalResponse[] = result.rows.map((row) => ({
        ticker: row.ticker,
        companyName: row.company_name,
        signalDate: row.signal_date,
        closePrice: row.close_price,
        priceChangePct: row.price_change_pct,
        ma20Signal: mapSignalDirection(row.ma_20_signal),
        ma60Signal: mapSignalDirection(row.ma_60_signal),
        ma250Signal: mapSignalDirection(row.ma_250_signal),
        source: row.source,
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
  } catch (error) {
    console.error('[ApiHandler] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error', message: (error as Error).message }),
    };
  }
};
