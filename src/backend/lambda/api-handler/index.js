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
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_secrets_manager = require("@aws-sdk/client-secrets-manager");
var import_client_rds_data = require("@aws-sdk/client-rds-data");
function convertPositionalToNamed(sql) {
  let index = 0;
  return sql.replace(/\$(\d+)/g, () => `:p${index++}`);
}
function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function toSqlParameter(value, index) {
  const name = `p${index}`;
  if (value === null || value === void 0) return { name, value: { isNull: true } };
  if (typeof value === "string") {
    if (isDateString(value)) {
      return { name, value: { stringValue: value }, typeHint: "DATE" };
    }
    return { name, value: { stringValue: value } };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { name, value: { longValue: value } } : { name, value: { doubleValue: value } };
  }
  if (typeof value === "boolean") return { name, value: { booleanValue: value } };
  if (Array.isArray(value)) return { name, value: { stringValue: `{${value.join(",")}}` } };
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
var DataApiPool = class {
  rdsClient;
  resourceArn;
  secretArn;
  database;
  constructor(resourceArn, secretArn, database) {
    this.rdsClient = new import_client_rds_data.RDSDataClient({ region: process.env.AWS_REGION || "us-west-2" });
    this.resourceArn = resourceArn;
    this.secretArn = secretArn;
    this.database = database;
  }
  async query(sql, params) {
    const convertedSql = convertPositionalToNamed(sql);
    const sqlParams = params?.map((value, index) => toSqlParameter(value, index));
    const response = await this.rdsClient.send(new import_client_rds_data.ExecuteStatementCommand({
      resourceArn: this.resourceArn,
      secretArn: this.secretArn,
      database: this.database,
      sql: convertedSql,
      parameters: sqlParams,
      includeResultMetadata: true
    }));
    const columnNames = response.columnMetadata?.map((col) => col.name || "") || [];
    const rows = (response.records || []).map((record) => {
      const row = {};
      record.forEach((field, index) => {
        row[columnNames[index] || `col${index}`] = fromField(field);
      });
      return row;
    });
    return { rows, rowCount: response.numberOfRecordsUpdated ?? rows.length };
  }
  async end() {
  }
};
var client = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
var secretsClient = new import_client_secrets_manager.SecretsManagerClient({});
var TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || "marketsage-analysis";
var dbPool = null;
function getDbPool() {
  if (dbPool) return dbPool;
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  const database = process.env.DB_NAME || "marketsage";
  dbPool = new DataApiPool(resourceArn, secretArn, database);
  return dbPool;
}
function mapSignalDirection(signal) {
  if (signal === "CROSS_ABOVE") return "UP";
  if (signal === "CROSS_BELOW") return "DOWN";
  return "NONE";
}
async function fetchCompanyDescriptions(tickers) {
  if (tickers.length === 0) return /* @__PURE__ */ new Map();
  const pool = getDbPool();
  const placeholders = tickers.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `SELECT ticker, description FROM russell_1000 WHERE ticker IN (${placeholders}) AND description IS NOT NULL AND description != ''`,
    tickers
  );
  const descMap = /* @__PURE__ */ new Map();
  for (const row of result.rows) {
    if (row.description) {
      descMap.set(row.ticker, row.description);
    }
  }
  return descMap;
}
function transformToStockReport(record, companyDescription) {
  const transformThesis = (thesis) => {
    if (!thesis?.thesis) return [];
    return thesis.thesis.map((t) => ({
      point: t.point,
      evidence: t.evidence,
      source: t.source || t.dataDate,
      sourceUrl: void 0
    }));
  };
  const transformRebuttals = (rebuttals) => {
    if (!rebuttals) return void 0;
    return {
      bullRebuttals: (rebuttals.bullRebuttals || []).map((r) => ({
        originalPoint: r.originalPoint,
        rebuttal: r.rebuttal,
        evidence: r.evidence,
        source: r.source,
        dataDate: r.dataDate,
        strengthOfRebuttal: r.strengthOfRebuttal
      })),
      bearRebuttals: (rebuttals.bearRebuttals || []).map((r) => ({
        originalPoint: r.originalPoint,
        rebuttal: r.rebuttal,
        evidence: r.evidence,
        source: r.source,
        dataDate: r.dataDate,
        strengthOfRebuttal: r.strengthOfRebuttal
      }))
    };
  };
  const transformPeers = (peers) => {
    if (!peers || peers.length === 0) return [];
    return peers.map((p, idx) => ({
      ticker: p.ticker,
      companyName: p.companyName || p.ticker,
      price: p.price || 0,
      peRatio: p.peRatio || 0,
      rsi: 50,
      // Default values since we don't have these in DynamoDB
      volumeDelta: 1,
      relativePerfomance: idx === 0 ? 0 : -5 * idx
    }));
  };
  const buildAppendix = (bull, bear) => {
    const parts = ["[AI THINKING TRACE]"];
    if (bull?.thinkingTrace) {
      parts.push("\n=== BULL AGENT ===");
      parts.push(bull.thinkingTrace);
    }
    if (bear?.thinkingTrace) {
      parts.push("\n=== BEAR AGENT ===");
      parts.push(bear.thinkingTrace);
    }
    return parts.join("\n");
  };
  const mapVerdict = (v) => {
    const lower = v.toLowerCase();
    if (lower.includes("buy") || lower.includes("bull")) return "Strong Buy";
    if (lower.includes("short") || lower.includes("bear") || lower.includes("sell")) return "Short";
    return "Neutral";
  };
  const getIntensity = (trigger) => {
    if (trigger === "250MA") return "High";
    if (trigger === "20MA") return "Low";
    return "Medium";
  };
  const mapTriggerType = (trigger) => {
    if (trigger === "250MA") return "250MA";
    if (trigger === "20MA") return "20MA";
    return "60MA";
  };
  return {
    ticker: record.ticker,
    companyName: record.companyName || record.ticker,
    // Use stored company name
    companyDescription,
    // Brief intro from russell_1000
    triggerDate: record.triggerDate,
    triggerType: mapTriggerType(record.triggerType),
    breakthroughIntensity: getIntensity(record.triggerType),
    verdict: mapVerdict(record.verdict),
    confidence: record.confidence,
    primaryCatalyst: record.primaryCatalyst || "Technical Breakout",
    peerTable: transformPeers(record.peers),
    // Round 1: Opening Arguments
    bullThesis: transformThesis(record.bullOpening),
    bearThesis: transformThesis(record.bearOpening),
    // Round 2: Rebuttals
    rebuttals: transformRebuttals(record.rebuttals),
    // Round 3: Final Defense
    bullDefense: record.bullDefense ? transformThesis(record.bullDefense) : void 0,
    bearDefense: record.bearDefense ? transformThesis(record.bearDefense) : void 0,
    // Conclusion
    consensusSummary: record.consensusSummary || [],
    reportContent: record.reportContent || "",
    // Chinese translations
    reportContentChinese: record.reportContentChinese,
    consensusSummaryChinese: record.consensusSummaryChinese,
    bullThesisChinese: record.bullOpeningChinese ? transformThesis(record.bullOpeningChinese) : void 0,
    bearThesisChinese: record.bearOpeningChinese ? transformThesis(record.bearOpeningChinese) : void 0,
    rebuttalsChinese: record.rebuttalsChinese ? transformRebuttals(record.rebuttalsChinese) : void 0,
    appendix: buildAppendix(record.bullOpening, record.bearOpening),
    thoughtSignature: record.thoughtSignature
  };
}
var handler = async (event) => {
  const { httpMethod, path, pathParameters, queryStringParameters } = event;
  console.log(`[ApiHandler] ${httpMethod} ${path}`);
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key"
  };
  try {
    if (path === "/health" || path === "/prod/health") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() })
      };
    }
    if ((path === "/dates" || path === "/prod/dates") && httpMethod === "GET") {
      const result = await docClient.send(new import_lib_dynamodb.ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "entityType = :et",
        ExpressionAttributeValues: {
          ":et": "ANALYSIS_REPORT"
        },
        ProjectionExpression: "triggerDate"
      }));
      const dates = [...new Set((result.Items || []).map((item) => item.triggerDate))].sort().reverse();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ dates })
      };
    }
    if ((path === "/reports" || path === "/prod/reports") && httpMethod === "GET") {
      const date = queryStringParameters?.date;
      if (!date) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "date query parameter is required" })
        };
      }
      const allItems = [];
      let lastEvaluatedKey;
      do {
        const result = await docClient.send(new import_lib_dynamodb.ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "triggerDate = :date AND entityType = :et",
          ExpressionAttributeValues: {
            ":date": date,
            ":et": "ANALYSIS_REPORT"
          },
          ExclusiveStartKey: lastEvaluatedKey
        }));
        if (result.Items) {
          allItems.push(...result.Items);
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      const tickers = allItems.map((item) => item.ticker);
      const descriptions = await fetchCompanyDescriptions(tickers);
      const reports = allItems.map((item) => {
        const record = item;
        return transformToStockReport(record, descriptions.get(record.ticker));
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ date, reports })
      };
    }
    if ((path.startsWith("/reports/") || path.startsWith("/prod/reports/")) && httpMethod === "GET") {
      const ticker = pathParameters?.ticker || path.split("/").pop();
      const date = queryStringParameters?.date;
      if (!ticker) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "ticker is required" })
        };
      }
      let result;
      if (date) {
        result = await docClient.send(new import_lib_dynamodb.QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI2PK = :pk AND GSI2SK = :sk",
          ExpressionAttributeValues: {
            ":pk": `TICKER#${ticker}`,
            ":sk": date
          }
        }));
      } else {
        result = await docClient.send(new import_lib_dynamodb.QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI2PK = :pk",
          ExpressionAttributeValues: {
            ":pk": `TICKER#${ticker}`
          },
          ScanIndexForward: false,
          // Most recent first
          Limit: 1
        }));
      }
      const item = result.Items?.[0];
      if (!item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "Report not found", ticker, date })
        };
      }
      const descriptions = await fetchCompanyDescriptions([ticker]);
      const report = transformToStockReport(item, descriptions.get(ticker));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ticker, date: report.triggerDate, report })
      };
    }
    if ((path === "/signals/dates" || path === "/prod/signals/dates") && httpMethod === "GET") {
      console.log("[ApiHandler] Fetching signal dates");
      const pool = getDbPool();
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
        body: JSON.stringify({ dates })
      };
    }
    if ((path === "/signals" || path === "/prod/signals") && httpMethod === "GET") {
      const date = queryStringParameters?.date;
      if (!date) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "date query parameter is required" })
        };
      }
      console.log(`[ApiHandler] Fetching signals for date: ${date}`);
      const pool = getDbPool();
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
      const signals = result.rows.map((row) => ({
        ticker: row.ticker,
        companyName: row.company_name ?? void 0,
        signalDate: row.signal_date,
        closePrice: row.close_price,
        priceChangePct: row.price_change_pct,
        ma20Signal: mapSignalDirection(row.ma_20_signal),
        ma60Signal: mapSignalDirection(row.ma_60_signal),
        ma250Signal: mapSignalDirection(row.ma_250_signal),
        source: row.source ?? void 0
      }));
      console.log(`[ApiHandler] Found ${signals.length} signals for ${date}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ date, signals })
      };
    }
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Not Found", path })
    };
  } catch (error) {
    console.error("[ApiHandler] Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal Server Error", message: error.message })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
