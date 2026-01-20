/**
 * Test script: Fetch Polygon snapshot and write to database
 * Run with: npx ts-node services/test-snapshot-to-db.ts
 */

import { PolygonClient, TickerSnapshot } from './polygon-client';
import { DatabaseService, TickerMetadata, PriceHistory } from './database';
import * as fs from 'fs';
import * as path from 'path';

// Configuration - Update these values
const POLYGON_API_KEY = 'oaY31nF343MlWvppz0W0kjQZRXrfWx2u';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'marketsage',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

async function runMigrations(db: DatabaseService): Promise<void> {
  console.log('Running database migrations...');

  const migrationPath = path.join(__dirname, '../../migrations/001_create_tables.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error: unknown) {
      // Ignore "already exists" errors
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes('already exists')) {
        console.error(`Migration error: ${errMsg}`);
      }
    }
  }

  console.log('Migrations completed!');
}

function convertSnapshotToRecords(
  snapshots: TickerSnapshot[],
  tradeDate: string
): { metadata: TickerMetadata[]; prices: PriceHistory[] } {
  const metadata: TickerMetadata[] = [];
  const prices: PriceHistory[] = [];

  for (const snapshot of snapshots) {
    // Skip if no day data
    if (!snapshot.day || snapshot.day.c === undefined) {
      continue;
    }

    // Add to metadata (basic info, sector/industry will need separate API call)
    metadata.push({
      ticker: snapshot.ticker,
      name: snapshot.ticker, // Polygon snapshot doesn't include name, we'll update later
    });

    // Add to price history
    prices.push({
      trade_date: tradeDate,
      ticker: snapshot.ticker,
      close_price: snapshot.day.c,
      c: snapshot.day.c,
      h: snapshot.day.h,
      l: snapshot.day.l,
      o: snapshot.day.o,
      v: snapshot.day.v,
      vw: snapshot.day.vw,
    });
  }

  return { metadata, prices };
}

async function main() {
  console.log('=== MarketSage: Snapshot to Database Test ===\n');

  // Initialize clients
  const polygon = new PolygonClient({ apiKey: POLYGON_API_KEY });
  const db = new DatabaseService(DB_CONFIG);

  try {
    // Step 1: Test database connection
    console.log('1. Testing database connection...');
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }
    console.log('   ✅ Database connected!\n');

    // Step 2: Run migrations
    console.log('2. Running migrations...');
    await runMigrations(db);
    console.log('   ✅ Migrations complete!\n');

    // Step 3: Fetch snapshot from Polygon
    console.log('3. Fetching all tickers snapshot from Polygon...');
    const snapshot = await polygon.getAllTickersSnapshot();
    console.log(`   Status: ${snapshot.status}`);
    console.log(`   Total tickers: ${snapshot.count}`);
    console.log('   ✅ Snapshot fetched!\n');

    // Step 4: Convert snapshot to database records
    const tradeDate = '2026-01-16'; // The date we're testing
    console.log(`4. Converting snapshot data for ${tradeDate}...`);
    const { metadata, prices } = convertSnapshotToRecords(snapshot.tickers, tradeDate);
    console.log(`   Metadata records: ${metadata.length}`);
    console.log(`   Price records: ${prices.length}`);
    console.log('   ✅ Conversion complete!\n');

    // Step 5: Insert metadata first (due to FK constraint)
    console.log('5. Inserting ticker metadata...');
    const metadataInserted = await db.bulkUpsertTickerMetadata(metadata);
    console.log(`   ✅ Inserted ${metadataInserted} ticker metadata records!\n`);

    // Step 6: Insert price history
    console.log('6. Inserting price history...');
    const pricesInserted = await db.bulkUpsertPriceHistory(prices);
    console.log(`   ✅ Inserted ${pricesInserted} price history records!\n`);

    // Step 7: Verify by reading some data back
    console.log('7. Verifying data...');

    // Check some well-known tickers
    const testTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
    console.log('\n   Sample data from database:');

    for (const ticker of testTickers) {
      const priceHistory = await db.getPriceHistory(ticker, tradeDate, tradeDate);
      if (priceHistory.length > 0) {
        const p = priceHistory[0];
        console.log(`   - ${ticker}: Close $${p.close_price}, O $${p.o}, H $${p.h}, L $${p.l}, V ${p.v?.toLocaleString()}`);
      }
    }

    // Get total counts
    const [{ count: metadataCount }] = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM ticker_metadata');
    const [{ count: priceCount }] = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM price_history WHERE trade_date = $1`, [tradeDate]);

    console.log(`\n   Total ticker_metadata records: ${metadataCount}`);
    console.log(`   Total price_history records for ${tradeDate}: ${priceCount}`);
    console.log('\n   ✅ Verification complete!\n');

    console.log('=== All tests passed! ===');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
