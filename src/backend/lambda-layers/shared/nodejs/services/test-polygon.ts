/**
 * Test script for Polygon API client
 * Run with: npx ts-node test-polygon.ts
 */

import { PolygonClient } from './polygon-client';

const API_KEY = 'oaY31nF343MlWvppz0W0kjQZRXrfWx2u';

async function testPolygonClient() {
  const client = new PolygonClient({ apiKey: API_KEY });

  console.log('=== Testing Polygon API Client ===\n');

  try {
    // Test 1: Get all tickers snapshot
    console.log('1. Fetching all tickers snapshot...');
    const snapshot = await client.getAllTickersSnapshot();

    console.log(`   Status: ${snapshot.status}`);
    console.log(`   Total tickers: ${snapshot.count}`);
    console.log(`   Request ID: ${snapshot.request_id}`);

    // Show first 5 tickers as sample
    console.log('\n   Sample tickers (first 5):');
    snapshot.tickers.slice(0, 5).forEach((ticker) => {
      console.log(`   - ${ticker.ticker}: Close $${ticker.day?.c?.toFixed(2) || 'N/A'}, Volume: ${ticker.day?.v?.toLocaleString() || 'N/A'}`);
    });

    // Find some well-known tickers
    const wellKnownTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
    console.log('\n   Well-known tickers:');
    wellKnownTickers.forEach((symbol) => {
      const ticker = snapshot.tickers.find((t) => t.ticker === symbol);
      if (ticker) {
        console.log(`   - ${ticker.ticker}: Close $${ticker.day?.c?.toFixed(2)}, Change: ${ticker.todaysChangePerc?.toFixed(2)}%`);
      }
    });

    console.log('\n✅ All tickers snapshot test passed!\n');

  } catch (error) {
    console.error('❌ Error fetching all tickers snapshot:', error);
  }

  try {
    // Test 2: Get single ticker snapshot (AAPL)
    console.log('2. Fetching single ticker snapshot (AAPL)...');
    const aaplSnapshot = await client.getTickerSnapshot('AAPL');

    console.log(`   Status: ${aaplSnapshot.status}`);
    console.log(`   Ticker: ${aaplSnapshot.ticker.ticker}`);
    console.log(`   Day Open: $${aaplSnapshot.ticker.day?.o?.toFixed(2)}`);
    console.log(`   Day High: $${aaplSnapshot.ticker.day?.h?.toFixed(2)}`);
    console.log(`   Day Low: $${aaplSnapshot.ticker.day?.l?.toFixed(2)}`);
    console.log(`   Day Close: $${aaplSnapshot.ticker.day?.c?.toFixed(2)}`);
    console.log(`   Day Volume: ${aaplSnapshot.ticker.day?.v?.toLocaleString()}`);
    console.log(`   Today's Change: ${aaplSnapshot.ticker.todaysChangePerc?.toFixed(2)}%`);

    console.log('\n✅ Single ticker snapshot test passed!\n');

  } catch (error) {
    console.error('❌ Error fetching single ticker snapshot:', error);
  }

  try {
    // Test 3: Get daily bars for historical data (useful for MA calculation)
    console.log('3. Fetching daily bars for AAPL (last 10 days)...');
    const bars = await client.getDailyBars('AAPL', '2026-01-06', '2026-01-16');

    console.log(`   Status: ${bars.status}`);
    console.log(`   Results count: ${bars.resultsCount}`);
    console.log('\n   Daily bars:');
    bars.results?.forEach((bar) => {
      const date = new Date(bar.t).toISOString().split('T')[0];
      console.log(`   - ${date}: O $${bar.o.toFixed(2)}, H $${bar.h.toFixed(2)}, L $${bar.l.toFixed(2)}, C $${bar.c.toFixed(2)}, V ${bar.v.toLocaleString()}`);
    });

    console.log('\n✅ Daily bars test passed!\n');

  } catch (error) {
    console.error('❌ Error fetching daily bars:', error);
  }

  console.log('=== All tests completed ===');
}

testPolygonClient();
