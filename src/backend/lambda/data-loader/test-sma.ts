/**
 * Simple test script for SMA fetching
 * Run with: npx ts-node test-sma.ts
 */

interface SMAValue {
  timestamp: number;
  value: number;
}

interface SMAResponse {
  results: {
    underlying: {
      url: string;
    };
    values: SMAValue[];
  };
  status: string;
  request_id: string;
}

const API_KEY = 'oaY31nF343MlWvppz0W0kjQZRXrfWx2u';

function unixMsToDateString(unixMs: number): string {
  const date = new Date(unixMs);
  return date.toISOString().split('T')[0];
}

async function fetchSMA(
  ticker: string,
  timestamp: string,
  window: number
): Promise<SMAResponse> {
  const url = `https://api.polygon.io/v1/indicators/sma/${ticker}?timestamp=${timestamp}&timespan=day&adjusted=true&window=${window}&series_type=close&order=desc&limit=1&apiKey=${API_KEY}`;

  console.log(`Fetching SMA(${window}) for ${ticker} at ${timestamp}...`);

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon SMA API error for ${ticker}: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function testSMA(ticker: string, tradeDate: string) {
  console.log(`\n=== Testing SMA for ${ticker} on ${tradeDate} ===\n`);

  try {
    // Fetch SMA for all three windows (20, 60, 250)
    const [sma20Response, sma60Response, sma250Response] = await Promise.all([
      fetchSMA(ticker, tradeDate, 20),
      fetchSMA(ticker, tradeDate, 60),
      fetchSMA(ticker, tradeDate, 250),
    ]);

    const sma20 = sma20Response.results?.values?.[0]?.value ?? null;
    const sma60 = sma60Response.results?.values?.[0]?.value ?? null;
    const sma250 = sma250Response.results?.values?.[0]?.value ?? null;

    // Get the trade date from response
    const smaTradeDate = sma20Response.results?.values?.[0]?.timestamp
      ? unixMsToDateString(sma20Response.results.values[0].timestamp)
      : tradeDate;

    console.log(`\nResults for ${ticker}:`);
    console.log(`  Trade Date: ${smaTradeDate}`);
    console.log(`  SMA(20):  ${sma20 !== null ? sma20.toFixed(4) : 'N/A'}`);
    console.log(`  SMA(60):  ${sma60 !== null ? sma60.toFixed(4) : 'N/A'}`);
    console.log(`  SMA(250): ${sma250 !== null ? sma250.toFixed(4) : 'N/A'}`);

    // Simulated DB insert
    console.log(`\n  Would insert into SMA table:`);
    console.log(`    trade_date: '${smaTradeDate}'`);
    console.log(`    ticker: '${ticker}'`);
    console.log(`    sma_20: ${sma20}`);
    console.log(`    sma_60: ${sma60}`);
    console.log(`    sma_250: ${sma250}`);

    return { ticker, smaTradeDate, sma20, sma60, sma250 };
  } catch (error) {
    console.error(`Error fetching SMA for ${ticker}:`, error);
    throw error;
  }
}

// Run test
async function main() {
  const testTicker = process.argv[2] || 'AAPL';
  const testDate = process.argv[3] || '2025-01-17';

  await testSMA(testTicker, testDate);
}

main().catch(console.error);
