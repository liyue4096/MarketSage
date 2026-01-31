"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;

/**
 * Technical Scanner Lambda
 * Calls report-selector to get tickers for analysis, then enriches them with peer data.
 * Returns formatted data for the adversarial analysis workflow.
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Peer mapping for common sectors (simplified - in production, use a database or API)
const PEER_MAP = {
  // Semiconductors
  'NVDA': ['AMD', 'INTC', 'QCOM'],
  'AMD': ['NVDA', 'INTC', 'QCOM'],
  'INTC': ['NVDA', 'AMD', 'QCOM'],
  'QCOM': ['NVDA', 'AMD', 'INTC'],
  'AVGO': ['NVDA', 'QCOM', 'TXN'],

  // Big Tech
  'AAPL': ['MSFT', 'GOOGL', 'META'],
  'MSFT': ['AAPL', 'GOOGL', 'AMZN'],
  'GOOGL': ['META', 'MSFT', 'AMZN'],
  'GOOG': ['META', 'MSFT', 'AMZN'],
  'AMZN': ['MSFT', 'GOOGL', 'WMT'],
  'META': ['GOOGL', 'SNAP', 'PINS'],
  'NFLX': ['DIS', 'WBD', 'PARA'],
  'TSLA': ['GM', 'F', 'RIVN'],

  // Financials
  'JPM': ['BAC', 'WFC', 'C'],
  'BAC': ['JPM', 'WFC', 'C'],
  'GS': ['MS', 'JPM', 'C'],

  // Entertainment
  'LYV': ['MSGS', 'EDR', 'LGF.A'],
  'DIS': ['NFLX', 'WBD', 'PARA'],

  // Retail
  'WMT': ['TGT', 'COST', 'AMZN'],
  'COST': ['WMT', 'TGT', 'BJ'],
  'TGT': ['WMT', 'COST', 'KR'],
  'ROST': ['TJX', 'BURL', 'GPS'],

  // Transportation
  'CSX': ['UNP', 'NSC', 'CP'],
  'UNP': ['CSX', 'NSC', 'CP'],

  // Liberty Media related
  'LBTYA': ['LBTYK', 'FWONK', 'SIRI'],
  'LLYVK': ['LLYVA', 'LYV', 'EDR'],
  'LLYVA': ['LLYVK', 'LYV', 'EDR'],
};

// Default peers by sector (when specific mapping not available)
function getDefaultPeers(ticker) {
  // Return generic large cap peers as fallback
  return ['SPY', 'QQQ', 'IWM'];
}

function getPeers(ticker) {
  return PEER_MAP[ticker] || getDefaultPeers(ticker);
}

const handler = async (event) => {
  console.log('[TechnicalScanner] Starting scan');

  const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION || 'us-west-2',
  });

  try {
    // Call report-selector Lambda to get tickers
    // Use !== undefined to properly handle 0 values
    // Accept both tradeDate and scanDate (scanDate comes from Step Function input)
    const payload = {
      action: 'select-tickers',
      tradeDate: event.tradeDate || event.scanDate, // Accept both formats from workflow
      nasdaqLimit: event.nasdaqLimit !== undefined ? event.nasdaqLimit : 4,
      russellLimit: event.russellLimit !== undefined ? event.russellLimit : 4,
      skipDays: event.skipDays !== undefined ? event.skipDays : 14,
    };

    console.log('[TechnicalScanner] Calling report-selector with:', JSON.stringify(payload));

    const invokeCommand = new InvokeCommand({
      FunctionName: 'marketsage-report-selector',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(invokeCommand);
    const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());

    console.log('[TechnicalScanner] Report-selector response:', JSON.stringify(responsePayload, null, 2));

    if (!responsePayload.success || !responsePayload.selectedTickers) {
      console.log('[TechnicalScanner] No tickers selected or error from report-selector');
      return {
        triggeredStocks: [],
        triggeredStocksCount: 0,
        scanDate: responsePayload.tradeDate || new Date().toISOString().split('T')[0],
      };
    }

    // Transform selected tickers into triggered stocks format
    const triggeredStocks = responsePayload.selectedTickers.map(ticker => ({
      ticker: ticker.ticker,
      companyName: ticker.name,
      triggerType: ticker.triggerType,
      closePrice: ticker.closePrice,
      peers: getPeers(ticker.ticker),
      // Additional metadata for logging/debugging
      source: ticker.source,
      weight: ticker.weight,
      signalCount: ticker.signalCount,
      signals: ticker.signals,
      priceChangePct: ticker.priceChangePct,
    }));

    console.log(`[TechnicalScanner] Found ${triggeredStocks.length} tickers for analysis`);
    console.log('[TechnicalScanner] Tickers:', triggeredStocks.map(s => `${s.ticker} (${s.triggerType})`).join(', '));

    return {
      triggeredStocks,
      triggeredStocksCount: triggeredStocks.length,
      scanDate: responsePayload.tradeDate,
    };

  } catch (error) {
    console.error('[TechnicalScanner] Error:', error);
    throw error;
  }
};

exports.handler = handler;
// Updated Sun Jan 25 00:23:33 PST 2026
