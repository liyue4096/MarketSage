/**
 * Technical Scanner Lambda
 * Calls report-selector to get tickers for analysis, then enriches them with peer data.
 * Returns formatted data for the adversarial analysis workflow.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Types
interface SelectedTicker {
  ticker: string;
  name: string;
  source: 'nasdaq_100' | 'russell_1000';
  weight?: number;
  signalCount?: number;
  signals?: {
    ma20: string;
    ma60: string;
    ma250: string;
  };
  priceChangePct?: number;
  closePrice?: number;
  triggerType: '20MA' | '60MA' | '250MA';
  activeSignals: ('20MA' | '60MA' | '250MA')[];
}

interface TriggeredStock {
  ticker: string;
  companyName: string;
  triggerType: '20MA' | '60MA' | '250MA';
  activeSignals: ('20MA' | '60MA' | '250MA')[];
  closePrice?: number;
  peers: string[];
  source?: string;
  weight?: number;
  signalCount?: number;
  signals?: {
    ma20: string;
    ma60: string;
    ma250: string;
  };
  priceChangePct?: number;
}

interface ScannerEvent {
  tradeDate?: string;
  scanDate?: string;
  nasdaqLimit?: number;
  russellLimit?: number;
  skipDays?: number;
}

interface ScannerResult {
  triggeredStocks: TriggeredStock[];
  triggeredStocksCount: number;
  scanDate: string;
}

// Peer mapping for common sectors
const PEER_MAP: Record<string, string[]> = {
  // Semiconductors
  'NVDA': ['AMD', 'INTC', 'QCOM'],
  'AMD': ['NVDA', 'INTC', 'QCOM'],
  'INTC': ['NVDA', 'AMD', 'QCOM'],
  'QCOM': ['NVDA', 'AMD', 'INTC'],
  'AVGO': ['NVDA', 'QCOM', 'TXN'],
  'MU': ['NVDA', 'AMD', 'INTC'],

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

function getPeers(ticker: string): string[] {
  return PEER_MAP[ticker] || ['SPY', 'QQQ', 'IWM'];
}

export const handler = async (event: ScannerEvent): Promise<ScannerResult> => {
  console.log('[TechnicalScanner] Starting scan');
  console.log('[TechnicalScanner] Received event:', JSON.stringify(event));

  const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION || 'us-west-2',
  });

  try {
    // Call report-selector Lambda to get tickers
    const payload = {
      action: 'select-tickers',
      tradeDate: event.tradeDate || event.scanDate,
      nasdaqLimit: event.nasdaqLimit ?? 4,
      russellLimit: event.russellLimit ?? 4,
      skipDays: event.skipDays ?? 14,
    };

    console.log('[TechnicalScanner] Calling report-selector with:', JSON.stringify(payload));

    const invokeCommand = new InvokeCommand({
      FunctionName: 'marketsage-report-selector',
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(invokeCommand);
    const responsePayload = JSON.parse(Buffer.from(response.Payload!).toString());

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
    const triggeredStocks: TriggeredStock[] = responsePayload.selectedTickers.map((ticker: SelectedTicker) => ({
      ticker: ticker.ticker,
      companyName: ticker.name,
      triggerType: ticker.triggerType,
      activeSignals: ticker.activeSignals,
      closePrice: ticker.closePrice,
      peers: getPeers(ticker.ticker),
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
