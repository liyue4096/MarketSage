/**
 * Ticker Enricher Lambda
 * Generates brief company descriptions using Gemini API
 * - Fetches tickers without descriptions from russell_1000
 * - Processes in batches with concurrency control
 * - Updates database with generated descriptions
 */

// Use shared GeminiClient from Lambda layer
const { GeminiClient } = require('/opt/nodejs/services/gemini-client');

import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
  TypeHint,
} from '@aws-sdk/client-rds-data';

type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

// ============================================
// Configuration
// ============================================
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

// ============================================
// RDS Data API Compatibility Layer
// ============================================
interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

function convertPositionalToNamed(sql: string): string {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => `:p${index++}`);
}

function toSqlParameter(value: unknown, index: number): { name: string; value: Field; typeHint?: TypeHint } {
  const name = `p${index}`;
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }
  if (typeof value === 'string') {
    return { name, value: { stringValue: value } };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { name, value: { longValue: value } };
    }
    return { name, value: { doubleValue: value } };
  }
  if (typeof value === 'boolean') {
    return { name, value: { booleanValue: value } };
  }
  return { name, value: { stringValue: String(value) } };
}

function fromField(field: Field): unknown {
  const f = field as unknown as Record<string, unknown>;
  if (f.isNull) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.longValue !== undefined) return Number(f.longValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  return null;
}

// ============================================
// Database Client
// ============================================
class DatabaseClient {
  private rdsClient: RDSDataClient;
  private resourceArn: string;
  private secretArn: string;
  private database: string;

  constructor() {
    this.rdsClient = new RDSDataClient({});
    this.resourceArn = process.env.DB_CLUSTER_ARN!;
    this.secretArn = process.env.DB_SECRET_ARN!;
    this.database = process.env.DB_NAME || 'marketsage';
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const convertedSql = convertPositionalToNamed(sql);
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));

    const command = new ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: convertedSql,
      parameters: sqlParams,
      includeResultMetadata: true,
    });

    const response = await this.rdsClient.send(command);
    const columnNames = response.columnMetadata?.map(col => col.name || '') || [];
    const rows = (response.records || []).map(record => {
      const row: Record<string, unknown> = {};
      record.forEach((field, i) => {
        row[columnNames[i]] = fromField(field);
      });
      return row as T;
    });

    return { rows, rowCount: rows.length };
  }
}

// ============================================
// Batch Processing Utilities
// ============================================

// Process items with controlled concurrency
async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<{ results: R[]; errors: { item: T; error: Error }[] }> {
  const results: R[] = [];
  const errors: { item: T; error: Error }[] = [];
  const queue = [...items];
  const inProgress: Promise<void>[] = [];

  const processNext = async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const result = await processor(item);
        results.push(result);
      } catch (error) {
        errors.push({ item, error: error as Error });
      }
    }
  };

  // Start concurrent workers
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    inProgress.push(processNext());
  }

  await Promise.all(inProgress);
  return { results, errors };
}

// ============================================
// Main Handler
// ============================================
interface EnrichEvent {
  batchSize?: number;
  concurrency?: number;
  limit?: number; // Optional limit for testing
}

interface TickerRecord {
  ticker: string;
  name: string;
}

export const handler: Handler<EnrichEvent> = async (event) => {
  const batchSize = event.batchSize || BATCH_SIZE;
  const concurrency = event.concurrency || CONCURRENCY;
  const limit = event.limit;

  console.log(`[TickerEnricher] Starting with batchSize=${batchSize}, concurrency=${concurrency}, limit=${limit || 'all'}`);

  const db = new DatabaseClient();
  // Use Flash model for simple factual tasks - faster & higher rate limits
  const gemini = new GeminiClient('gemini-2.5-flash');

  // Run migration to add description column if needed
  try {
    await db.query(`
      ALTER TABLE russell_1000
      ADD COLUMN IF NOT EXISTS description TEXT
    `);
    console.log('[TickerEnricher] Ensured description column exists');
  } catch (error) {
    console.log('[TickerEnricher] Description column already exists or migration skipped');
  }

  // Fetch tickers without descriptions
  let sql = `
    SELECT ticker, name
    FROM russell_1000
    WHERE description IS NULL OR description = ''
    ORDER BY ticker
  `;

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  const { rows: tickers } = await db.query<TickerRecord>(sql);
  console.log(`[TickerEnricher] Found ${tickers.length} tickers without descriptions`);

  if (tickers.length === 0) {
    return {
      statusCode: 200,
      body: { message: 'All tickers already have descriptions', processed: 0 }
    };
  }

  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(tickers.length / batchSize);

    console.log(`[TickerEnricher] Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)`);

    const { results, errors } = await processWithConcurrency(
      batch,
      async (ticker) => {
        const prompt = `Generate a brief company description for ${ticker.name} (${ticker.ticker}) in 2-3 sentences (under 100 words).
Include:
1. What the company does (core business)
2. 3-4 main competitors

Format: "[Business description]. Main competitors: [Competitor1], [Competitor2], [Competitor3]."

Be concise and factual. No marketing language.`;

        const text = await gemini.generate(prompt);

        if (!text || text.trim() === '') {
          throw new Error(`Empty response for ${ticker.ticker}`);
        }

        // Update database
        await db.query(
          `UPDATE russell_1000 SET description = $1 WHERE ticker = $2`,
          [text.trim(), ticker.ticker]
        );

        console.log(`[TickerEnricher] Updated ${ticker.ticker}`);
        return { ticker: ticker.ticker, description: text.trim() };
      },
      concurrency
    );

    processed += results.length;
    failed += errors.length;

    if (errors.length > 0) {
      console.error(`[TickerEnricher] Batch ${batchNum} had ${errors.length} failures:`,
        errors.map(e => `${(e.item as TickerRecord).ticker}: ${e.error.message}`));
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (tickers.length - processed - failed) / rate;

    console.log(`[TickerEnricher] Progress: ${processed}/${tickers.length} (${(processed/tickers.length*100).toFixed(1)}%), Rate: ${rate.toFixed(1)}/sec, ETA: ${eta.toFixed(0)}s`);
  }

  const totalTime = (Date.now() - startTime) / 1000;

  const summary = {
    message: 'Ticker enrichment completed',
    totalTickers: tickers.length,
    processed,
    failed,
    totalTimeSeconds: totalTime.toFixed(1),
    averageRate: (processed / totalTime).toFixed(2) + '/sec'
  };

  console.log('[TickerEnricher] Summary:', summary);

  return {
    statusCode: 200,
    body: summary
  };
};
