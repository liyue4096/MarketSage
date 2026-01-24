/**
 * Run database migrations
 * Usage: npx ts-node run-migration.ts
 */

import * as dotenv from './lambda-layers/shared/nodejs/node_modules/dotenv';
import { Pool } from './lambda-layers/shared/nodejs/node_modules/pg';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'marketsage-aurora.cluster-ctmm0aucyuab.us-west-2.rds.amazonaws.com',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'marketsage',
  user: process.env.DB_USER || 'marketsage_admin',
  password: process.env.DB_PASSWORD,
};

async function runMigration() {
  if (!DB_CONFIG.password) {
    console.error('DB_PASSWORD environment variable is required');
    process.exit(1);
  }

  console.log('Connecting to database...');
  console.log(`Host: ${DB_CONFIG.host}`);
  console.log(`Database: ${DB_CONFIG.database}`);

  const pool = new Pool({
    ...DB_CONFIG,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('Connected successfully!\n');

    // Read and run migration 002
    const migrationPath = path.join(__dirname, 'migrations/002_create_ma_signals.sql');

    if (!fs.existsSync(migrationPath)) {
      console.error(`Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    console.log('Running migration 002_create_ma_signals.sql...\n');

    await client.query(sql);
    console.log('Migration completed successfully!\n');

    // Verify table exists
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'ma_signals%'
      ORDER BY table_name
    `);

    console.log('Created tables:');
    for (const row of result.rows) {
      console.log(`  - ${row.table_name}`);
    }

    // Check columns
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ma_signals'
      ORDER BY ordinal_position
    `);

    console.log('\nma_signals columns:');
    for (const col of columns.rows) {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    }

    client.release();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
