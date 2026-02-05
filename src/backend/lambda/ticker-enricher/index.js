"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.ts
var index_exports = {};
__export(index_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(index_exports);
var import_client_rds_data = require("@aws-sdk/client-rds-data");
var { GeminiClient } = require("/opt/nodejs/services/gemini-client");
var BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50", 10);
var CONCURRENCY = parseInt(process.env.CONCURRENCY || "10", 10);
function convertPositionalToNamed(sql) {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => `:p${index++}`);
}
function toSqlParameter(value, index) {
  const name = `p${index}`;
  if (value === null || value === void 0) {
    return { name, value: { isNull: true } };
  }
  if (typeof value === "string") {
    return { name, value: { stringValue: value } };
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { name, value: { longValue: value } };
    }
    return { name, value: { doubleValue: value } };
  }
  if (typeof value === "boolean") {
    return { name, value: { booleanValue: value } };
  }
  return { name, value: { stringValue: String(value) } };
}
function fromField(field) {
  const f = field;
  if (f.isNull) return null;
  if (f.stringValue !== void 0) return f.stringValue;
  if (f.longValue !== void 0) return Number(f.longValue);
  if (f.doubleValue !== void 0) return f.doubleValue;
  if (f.booleanValue !== void 0) return f.booleanValue;
  return null;
}
var DatabaseClient = class {
  rdsClient;
  resourceArn;
  secretArn;
  database;
  constructor() {
    this.rdsClient = new import_client_rds_data.RDSDataClient({});
    this.resourceArn = process.env.DB_CLUSTER_ARN;
    this.secretArn = process.env.DB_SECRET_ARN;
    this.database = process.env.DB_NAME || "marketsage";
  }
  async query(sql, params) {
    const convertedSql = convertPositionalToNamed(sql);
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));
    const command = new import_client_rds_data.ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: convertedSql,
      parameters: sqlParams,
      includeResultMetadata: true
    });
    const response = await this.rdsClient.send(command);
    const columnNames = response.columnMetadata?.map((col) => col.name || "") || [];
    const rows = (response.records || []).map((record) => {
      const row = {};
      record.forEach((field, i) => {
        row[columnNames[i]] = fromField(field);
      });
      return row;
    });
    return { rows, rowCount: rows.length };
  }
};
async function processWithConcurrency(items, processor, concurrency) {
  const results = [];
  const errors = [];
  const queue = [...items];
  const inProgress = [];
  const processNext = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        const result = await processor(item);
        results.push(result);
      } catch (error) {
        errors.push({ item, error });
      }
    }
  };
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    inProgress.push(processNext());
  }
  await Promise.all(inProgress);
  return { results, errors };
}
var handler = async (event) => {
  const batchSize = event.batchSize || BATCH_SIZE;
  const concurrency = event.concurrency || CONCURRENCY;
  const limit = event.limit;
  console.log(`[TickerEnricher] Starting with batchSize=${batchSize}, concurrency=${concurrency}, limit=${limit || "all"}`);
  const db = new DatabaseClient();
  const gemini = new GeminiClient("gemini-2.5-flash");
  try {
    await db.query(`
      ALTER TABLE russell_1000
      ADD COLUMN IF NOT EXISTS description TEXT
    `);
    console.log("[TickerEnricher] Ensured description column exists");
  } catch (error) {
    console.log("[TickerEnricher] Description column already exists or migration skipped");
  }
  let sql = `
    SELECT ticker, name
    FROM russell_1000
    WHERE description IS NULL OR description = ''
    ORDER BY ticker
  `;
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }
  const { rows: tickers } = await db.query(sql);
  console.log(`[TickerEnricher] Found ${tickers.length} tickers without descriptions`);
  if (tickers.length === 0) {
    return {
      statusCode: 200,
      body: { message: "All tickers already have descriptions", processed: 0 }
    };
  }
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;
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
        if (!text || text.trim() === "") {
          throw new Error(`Empty response for ${ticker.ticker}`);
        }
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
      console.error(
        `[TickerEnricher] Batch ${batchNum} had ${errors.length} failures:`,
        errors.map((e) => `${e.item.ticker}: ${e.error.message}`)
      );
    }
    const elapsed = (Date.now() - startTime) / 1e3;
    const rate = processed / elapsed;
    const eta = (tickers.length - processed - failed) / rate;
    console.log(`[TickerEnricher] Progress: ${processed}/${tickers.length} (${(processed / tickers.length * 100).toFixed(1)}%), Rate: ${rate.toFixed(1)}/sec, ETA: ${eta.toFixed(0)}s`);
  }
  const totalTime = (Date.now() - startTime) / 1e3;
  const summary = {
    message: "Ticker enrichment completed",
    totalTickers: tickers.length,
    processed,
    failed,
    totalTimeSeconds: totalTime.toFixed(1),
    averageRate: (processed / totalTime).toFixed(2) + "/sec"
  };
  console.log("[TickerEnricher] Summary:", summary);
  return {
    statusCode: 200,
    body: summary
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
