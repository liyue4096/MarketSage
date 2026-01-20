/**
 * Polygon.io API Client
 * Provides methods to fetch market data from Polygon.io
 */

export interface TickerSnapshot {
  ticker: string;
  todaysChangePerc: number;
  todaysChange: number;
  updated: number;
  day: {
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume
    vw: number; // volume weighted average price
  };
  prevDay: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
  min?: {
    av: number;    // accumulated volume
    t: number;     // timestamp
    n: number;     // number of transactions
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw: number;
  };
}

export interface AllTickersSnapshotResponse {
  status: string;
  request_id: string;
  count: number;
  tickers: TickerSnapshot[];
}

export interface PolygonClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class PolygonClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: PolygonClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.polygon.io';
  }

  /**
   * Get snapshot of all US stock tickers
   * Uses v2/snapshot/locale/us/markets/stocks/tickers endpoint
   * Returns closing price for every ticker in the market in one API call
   */
  async getAllTickersSnapshot(): Promise<AllTickersSnapshotResponse> {
    const url = `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get snapshot for a specific ticker
   */
  async getTickerSnapshot(ticker: string): Promise<{ status: string; ticker: TickerSnapshot }> {
    const url = `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get daily bars (OHLCV) for a specific date range
   * Useful for calculating moving averages
   */
  async getDailyBars(
    ticker: string,
    from: string,
    to: string
  ): Promise<{
    status: string;
    resultsCount: number;
    results: Array<{
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
      t: number;
      n: number;
    }>;
  }> {
    const url = `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${this.apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
}

export default PolygonClient;
