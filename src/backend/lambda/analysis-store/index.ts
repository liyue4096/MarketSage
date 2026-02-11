/**
 * Analysis Store Lambda
 * Stores GAN loop analysis results into DynamoDB
 *
 * Table Design (Updated):
 * - Primary Key: PK = ticker#date (e.g., "AAPL#2026-01-22"), SK = thought_signature
 *   This allows multiple analyses per ticker/date if needed, and new reports for same ticker on different dates
 * - GSI1: thought_signature (for retro-exam lookups) - PK: SIG#{signature}
 * - GSI2: ticker only (for listing all analyses by ticker sorted by date) - PK: TICKER#{ticker}, SK: DATE#{date}
 *
 * Single Table Design - all data in one item for efficient retrieval
 */

// Use require for Lambda runtime compatibility
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Types for GAN analysis results
interface ThesisPoint {
  point: string;
  evidence: string;
  source?: string;
  confidence: number;
}

interface RebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  strengthOfRebuttal: number;
}

interface AgentOutput {
  ticker: string;
  role: 'BULL' | 'BEAR';
  thesis: ThesisPoint[];
  primaryCatalyst?: string;  // Bull
  primaryRisk?: string;      // Bear
  thinkingTrace: string;
  timestamp: string;
}

interface RebuttalOutput {
  ticker: string;
  bullRebuttals: RebuttalPoint[];
  bearRebuttals: RebuttalPoint[];
  thinkingTrace: string;
  timestamp: string;
}

interface JudgeOutput {
  ticker: string;
  verdict: 'Strong Buy' | 'Neutral' | 'Short';
  confidence: number;
  primaryCatalyst: string;
  consensusSummary: string[];
  reportContent: string;
  thoughtSignature: string;
  appendix: string;
  timestamp: string;
}

interface StoreAnalysisEvent {
  action: 'store-analysis' | 'query-analysis' | 'query-by-signature' | 'query-by-ticker-date';
  // For store-analysis
  triggerDate?: string;
  triggerType?: '20MA' | '60MA' | '250MA';
  activeSignals?: ('20MA' | '60MA' | '250MA')[];
  closePrice?: number;
  peers?: string[];
  companyName?: string;
  bullOpening?: AgentOutput;
  bearOpening?: AgentOutput;
  rebuttals?: RebuttalOutput;
  bullDefense?: AgentOutput;
  bearDefense?: AgentOutput;
  judge?: JudgeOutput;
  // For Chinese translation (optional, added after initial store)
  reportContentChinese?: string;
  consensusSummaryChinese?: string[];
  bullOpeningChinese?: AgentOutput;
  bearOpeningChinese?: AgentOutput;
  rebuttalsChinese?: RebuttalOutput;
  // For query-analysis (by ticker)
  ticker?: string;
  // For query-by-signature
  thoughtSignature?: string;
  // For query-by-ticker-date (direct lookup)
  date?: string;
}

interface StoreAnalysisResult {
  success: boolean;
  action: string;
  message: string;
  thoughtSignature?: string;
  s3Key?: string;
  data?: any;
}

// DynamoDB table name
const TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'marketsage-analysis';

// S3 bucket for full reports
const REPORTS_BUCKET = process.env.REPORTS_BUCKET_NAME || '';

// DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-2',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT
  })
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  }
});

// S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

// --- Markdown report generation helpers ---

function formatThesisPoints(lines: string[], thesis?: ThesisPoint[]): void {
  if (!thesis?.length) return;
  thesis.forEach((p, i) => {
    lines.push(`### Point ${i + 1}: ${p.point}`);
    lines.push('');
    lines.push(p.evidence);
    if (p.source) lines.push(`\n*Source: ${p.source}*`);
    if (p.confidence) lines.push(`\n*Confidence: ${p.confidence}/10*`);
    lines.push('');
  });
}

function formatRebuttals(lines: string[], heading: string, rebuttals?: RebuttalPoint[]): void {
  if (!rebuttals?.length) return;
  lines.push(`### ${heading}`);
  lines.push('');
  rebuttals.forEach((r, i) => {
    lines.push(`**${i + 1}. Against:** ${r.originalPoint}`);
    lines.push(`**Rebuttal:** ${r.rebuttal}`);
    lines.push(`**Evidence:** ${r.evidence}`);
    lines.push(`**Strength:** ${r.strengthOfRebuttal}/10`);
    lines.push('');
  });
}

function generateMarkdownReport(report: Record<string, any>): string {
  const lines: string[] = [];

  // Header / Metadata
  lines.push(`# ${report.ticker} - ${report.companyName || report.ticker}`);
  lines.push('');
  lines.push(`**Date:** ${report.triggerDate}`);
  lines.push(`**Trigger:** ${report.triggerType}`);
  lines.push(`**Active Signals:** ${(report.activeSignals || [report.triggerType]).join(', ')}`);
  if (report.closePrice) lines.push(`**Close Price:** $${report.closePrice}`);
  lines.push(`**Verdict:** ${report.verdict}`);
  lines.push(`**Confidence:** ${report.confidence}/10`);
  lines.push(`**Thought Signature:** \`${report.thoughtSignature}\``);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.primaryCatalyst || '');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Bull Thesis (EN)
  lines.push('## Bull Thesis (English)');
  lines.push('');
  if (report.bullOpening?.primaryCatalyst) {
    lines.push(`**Primary Catalyst:** ${report.bullOpening.primaryCatalyst}`);
    lines.push('');
  }
  formatThesisPoints(lines, report.bullOpening?.thesis);

  // Bull Thesis (CN)
  if (report.bullOpeningChinese?.thesis) {
    lines.push('## Bull Thesis (Chinese / 看多论点)');
    lines.push('');
    if (report.bullOpeningChinese.primaryCatalyst) {
      lines.push(`**主要催化剂:** ${report.bullOpeningChinese.primaryCatalyst}`);
      lines.push('');
    }
    formatThesisPoints(lines, report.bullOpeningChinese.thesis);
  }

  lines.push('---');
  lines.push('');

  // Bear Thesis (EN)
  lines.push('## Bear Thesis (English)');
  lines.push('');
  if (report.bearOpening?.primaryRisk) {
    lines.push(`**Primary Risk:** ${report.bearOpening.primaryRisk}`);
    lines.push('');
  }
  formatThesisPoints(lines, report.bearOpening?.thesis);

  // Bear Thesis (CN)
  if (report.bearOpeningChinese?.thesis) {
    lines.push('## Bear Thesis (Chinese / 看空论点)');
    lines.push('');
    if (report.bearOpeningChinese.primaryRisk) {
      lines.push(`**主要风险:** ${report.bearOpeningChinese.primaryRisk}`);
      lines.push('');
    }
    formatThesisPoints(lines, report.bearOpeningChinese.thesis);
  }

  lines.push('---');
  lines.push('');

  // Rebuttals (EN)
  if (report.rebuttals) {
    lines.push('## Cross-Examination (English)');
    lines.push('');
    formatRebuttals(lines, 'Bull Rebuttals to Bear Points', report.rebuttals.bullRebuttals);
    formatRebuttals(lines, 'Bear Rebuttals to Bull Points', report.rebuttals.bearRebuttals);
  }

  // Rebuttals (CN)
  if (report.rebuttalsChinese) {
    lines.push('## Cross-Examination (Chinese / 交叉质询)');
    lines.push('');
    formatRebuttals(lines, '多方反驳', report.rebuttalsChinese.bullRebuttals);
    formatRebuttals(lines, '空方反驳', report.rebuttalsChinese.bearRebuttals);
  }

  lines.push('---');
  lines.push('');

  // Consensus Summary (EN)
  lines.push('## Consensus Summary');
  lines.push('');
  (report.consensusSummary || []).forEach((s: string, i: number) => {
    lines.push(`${i + 1}. ${s}`);
  });
  lines.push('');

  // Consensus Summary (CN)
  if (report.consensusSummaryChinese?.length) {
    lines.push('## Consensus Summary (Chinese / 共识总结)');
    lines.push('');
    report.consensusSummaryChinese.forEach((s: string, i: number) => {
      lines.push(`${i + 1}. ${s}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Full Report (EN)
  if (report.reportContent) {
    lines.push('## Full Report (English)');
    lines.push('');
    lines.push(report.reportContent);
    lines.push('');
  }

  // Full Report (CN)
  if (report.reportContentChinese) {
    lines.push('## Full Report (Chinese / 完整报告)');
    lines.push('');
    lines.push(report.reportContentChinese);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Appendix: Thinking Traces
  lines.push('## Appendix: Deep Thinking Traces');
  lines.push('');

  if (report.appendix) {
    lines.push('### Judge Thinking Trace');
    lines.push('');
    lines.push(report.appendix);
    lines.push('');
  }

  if (report.bullOpening?.thinkingTrace) {
    lines.push('### Bull Agent Thinking Trace');
    lines.push('');
    lines.push(report.bullOpening.thinkingTrace);
    lines.push('');
  }

  if (report.bearOpening?.thinkingTrace) {
    lines.push('### Bear Agent Thinking Trace');
    lines.push('');
    lines.push(report.bearOpening.thinkingTrace);
    lines.push('');
  }

  if (report.rebuttals?.thinkingTrace) {
    lines.push('### Rebuttals Thinking Trace');
    lines.push('');
    lines.push(report.rebuttals.thinkingTrace);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by MarketSage on ${report.createdAt || new Date().toISOString()}*`);

  return lines.join('\n');
}

// Write full report to S3 as formatted Markdown (called after final update with translations)
async function writeReportToS3(
  ticker: string,
  triggerDate: string,
  fullReport: Record<string, any>
): Promise<void> {
  if (!REPORTS_BUCKET) {
    console.log('[AnalysisStore] S3 bucket not configured, skipping S3 write');
    return;
  }

  const s3Key = `${triggerDate}/${ticker}.md`;

  try {
    const markdown = generateMarkdownReport(fullReport);
    await s3Client.send(new PutObjectCommand({
      Bucket: REPORTS_BUCKET,
      Key: s3Key,
      Body: markdown,
      ContentType: 'text/markdown',
      ContentDisposition: `attachment; filename="${ticker}_${triggerDate}_report.md"`,
    }));
    console.log(`[AnalysisStore] Written full report to s3://${REPORTS_BUCKET}/${s3Key}`);
  } catch (error) {
    // Log but don't fail - S3 is for download convenience, DynamoDB is source of truth
    console.error(`[AnalysisStore] Failed to write to S3: ${(error as Error).message}`);
  }
}

// Store analysis results
async function storeAnalysis(event: StoreAnalysisEvent): Promise<StoreAnalysisResult> {
  const {
    triggerDate, triggerType, activeSignals, closePrice, peers, companyName,
    bullOpening, bearOpening, rebuttals, bullDefense, bearDefense, judge,
    reportContentChinese, consensusSummaryChinese,
    bullOpeningChinese, bearOpeningChinese, rebuttalsChinese
  } = event;

  if (!judge || !bullOpening || !bearOpening) {
    throw new Error('Missing required analysis data (judge, bullOpening, bearOpening)');
  }

  const ticker = judge.ticker;
  const thoughtSignature = judge.thoughtSignature;

  // Single table design - store everything in one item
  // PK format: ticker#date (allows new reports for same ticker on different dates)
  const item = {
    // Primary Key: Combined ticker and date for uniqueness
    PK: `${ticker}#${triggerDate}`,
    SK: thoughtSignature,

    // GSI1: For lookup by thought_signature (retro-exam)
    GSI1PK: `SIG#${thoughtSignature}`,
    GSI1SK: `${ticker}#${triggerDate}`,

    // GSI2: For listing by ticker with date sorting
    GSI2PK: `TICKER#${ticker}`,
    GSI2SK: triggerDate,

    // Entity type for filtering
    entityType: 'ANALYSIS_REPORT',

    // Core fields
    ticker,
    companyName: companyName || ticker, // Fall back to ticker if not provided
    triggerDate,
    triggerType,
    activeSignals: activeSignals || [triggerType], // All active signals, fallback to primary
    closePrice,
    peers: peers || [],

    // Judge verdict
    verdict: judge.verdict,
    confidence: judge.confidence,
    primaryCatalyst: judge.primaryCatalyst,
    consensusSummary: judge.consensusSummary,
    reportContent: judge.reportContent,
    // Chinese translations (if provided)
    reportContentChinese: reportContentChinese || null,
    consensusSummaryChinese: consensusSummaryChinese || null,
    thoughtSignature,
    appendix: judge.appendix,

    // Round 1: Opening Arguments
    bullOpening: {
      thesis: bullOpening.thesis,
      primaryCatalyst: bullOpening.primaryCatalyst,
      thinkingTrace: bullOpening.thinkingTrace,
      timestamp: bullOpening.timestamp
    },
    bearOpening: {
      thesis: bearOpening.thesis,
      primaryRisk: bearOpening.primaryRisk,
      thinkingTrace: bearOpening.thinkingTrace,
      timestamp: bearOpening.timestamp
    },
    // Chinese translations for Opening Arguments
    bullOpeningChinese: bullOpeningChinese ? {
      thesis: bullOpeningChinese.thesis,
      primaryCatalyst: bullOpeningChinese.primaryCatalyst,
      thinkingTrace: bullOpeningChinese.thinkingTrace,
      timestamp: bullOpeningChinese.timestamp
    } : null,
    bearOpeningChinese: bearOpeningChinese ? {
      thesis: bearOpeningChinese.thesis,
      primaryRisk: bearOpeningChinese.primaryRisk,
      thinkingTrace: bearOpeningChinese.thinkingTrace,
      timestamp: bearOpeningChinese.timestamp
    } : null,

    // Round 2: Rebuttals
    rebuttals: rebuttals ? {
      bullRebuttals: rebuttals.bullRebuttals,
      bearRebuttals: rebuttals.bearRebuttals,
      thinkingTrace: rebuttals.thinkingTrace,
      timestamp: rebuttals.timestamp
    } : null,
    // Chinese translations for Rebuttals
    rebuttalsChinese: rebuttalsChinese ? {
      bullRebuttals: rebuttalsChinese.bullRebuttals,
      bearRebuttals: rebuttalsChinese.bearRebuttals,
      thinkingTrace: rebuttalsChinese.thinkingTrace,
      timestamp: rebuttalsChinese.timestamp
    } : null,

    // Round 3: Final Defense
    bullDefense: bullDefense ? {
      thesis: bullDefense.thesis,
      primaryCatalyst: bullDefense.primaryCatalyst,
      thinkingTrace: bullDefense.thinkingTrace,
      timestamp: bullDefense.timestamp
    } : null,
    bearDefense: bearDefense ? {
      thesis: bearDefense.thesis,
      primaryRisk: bearDefense.primaryRisk,
      thinkingTrace: bearDefense.thinkingTrace,
      timestamp: bearDefense.timestamp
    } : null,

    // Metadata
    createdAt: new Date().toISOString(),

    // TTL: Keep analyses for 2 years (optional, comment out if not needed)
    // ttl: Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60)
  };

  // If Chinese translation is being added, this is an update - allow overwrite
  // Otherwise, prevent duplicate creation
  if (reportContentChinese) {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    // Write full report to S3 only when translations are complete (final step)
    // This creates the downloadable full report at s3://{bucket}/{date}/{ticker}.json
    await writeReportToS3(ticker, triggerDate!, item);
  } else {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
    }));
  }

  return {
    success: true,
    action: 'store-analysis',
    message: `Analysis stored successfully for ${ticker} on ${triggerDate}`,
    thoughtSignature,
    s3Key: reportContentChinese ? `${triggerDate}/${ticker}.md` : undefined,
  };
}

// Query analysis by ticker (returns most recent analyses)
async function queryByTicker(ticker: string): Promise<StoreAnalysisResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `TICKER#${ticker}`
    },
    ScanIndexForward: false, // Most recent first
    Limit: 10
  }));

  return {
    success: true,
    action: 'query-analysis',
    message: `Found ${result.Items?.length || 0} analyses for ${ticker}`,
    data: result.Items
  };
}

// Query analysis by thought signature (for retro-exam)
async function queryBySignature(thoughtSignature: string): Promise<StoreAnalysisResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `SIG#${thoughtSignature}`
    },
    Limit: 1
  }));

  if (!result.Items || result.Items.length === 0) {
    return {
      success: false,
      action: 'query-by-signature',
      message: `No analysis found for signature: ${thoughtSignature}`
    };
  }

  return {
    success: true,
    action: 'query-by-signature',
    message: 'Analysis found',
    data: result.Items[0]
  };
}

// Query analysis by ticker and date (direct primary key lookup)
async function queryByTickerDate(ticker: string, date: string): Promise<StoreAnalysisResult> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `${ticker}#${date}`
    }
  }));

  if (!result.Items || result.Items.length === 0) {
    return {
      success: false,
      action: 'query-by-ticker-date',
      message: `No analysis found for ${ticker} on ${date}`
    };
  }

  return {
    success: true,
    action: 'query-by-ticker-date',
    message: `Found ${result.Items.length} analysis(es) for ${ticker} on ${date}`,
    data: result.Items
  };
}

// Lambda handler
type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

export const handler: Handler<StoreAnalysisEvent, StoreAnalysisResult> = async (event) => {
  console.log('[AnalysisStore] Received event:', JSON.stringify(event, null, 2));

  try {
    switch (event.action) {
      case 'store-analysis':
        return await storeAnalysis(event);

      case 'query-analysis':
        if (!event.ticker) {
          throw new Error('ticker is required for query-analysis');
        }
        return await queryByTicker(event.ticker);

      case 'query-by-signature':
        if (!event.thoughtSignature) {
          throw new Error('thoughtSignature is required for query-by-signature');
        }
        return await queryBySignature(event.thoughtSignature);

      case 'query-by-ticker-date':
        if (!event.ticker || !event.date) {
          throw new Error('ticker and date are required for query-by-ticker-date');
        }
        return await queryByTickerDate(event.ticker, event.date);

      default:
        return {
          success: false,
          action: event.action || 'unknown',
          message: `Unknown action: ${event.action}. Valid actions: store-analysis, query-analysis, query-by-signature, query-by-ticker-date`
        };
    }
  } catch (error) {
    console.error('[AnalysisStore] Error:', error);

    // Handle conditional check failure (duplicate)
    if ((error as any).name === 'ConditionalCheckFailedException') {
      return {
        success: false,
        action: event.action || 'unknown',
        message: 'Analysis with this signature already exists'
      };
    }

    return {
      success: false,
      action: event.action || 'unknown',
      message: `Error: ${(error as Error).message}`
    };
  }
};
