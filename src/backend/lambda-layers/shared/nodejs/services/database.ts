/**
 * Database Service
 * Handles PostgreSQL connections and operations for MarketSage
 */

import { Pool, PoolConfig } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface TickerMetadata {
  ticker: string;
  name: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  last_updated?: Date;
}

export interface PriceHistory {
  trade_date: string;
  ticker: string;
  close_price: number;
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  v?: number;
  vw?: number;
}

export class DatabaseService {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
    this.pool = new Pool(poolConfig);
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  /**
   * Run raw SQL query
   */
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Upsert ticker metadata (insert or update on conflict)
   */
  async upsertTickerMetadata(ticker: TickerMetadata): Promise<void> {
    const sql = `
      INSERT INTO ticker_metadata (ticker, name, sector, industry, market_cap, last_updated)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (ticker) DO UPDATE SET
        name = EXCLUDED.name,
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        market_cap = EXCLUDED.market_cap,
        last_updated = NOW()
    `;
    await this.pool.query(sql, [
      ticker.ticker,
      ticker.name,
      ticker.sector || null,
      ticker.industry || null,
      ticker.market_cap || null,
    ]);
  }

  /**
   * Bulk upsert ticker metadata
   */
  async bulkUpsertTickerMetadata(tickers: TickerMetadata[]): Promise<number> {
    if (tickers.length === 0) return 0;

    const client = await this.pool.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const ticker of tickers) {
        const sql = `
          INSERT INTO ticker_metadata (ticker, name, sector, industry, market_cap, last_updated)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (ticker) DO UPDATE SET
            name = EXCLUDED.name,
            sector = EXCLUDED.sector,
            industry = EXCLUDED.industry,
            market_cap = EXCLUDED.market_cap,
            last_updated = NOW()
        `;
        await client.query(sql, [
          ticker.ticker,
          ticker.name,
          ticker.sector || null,
          ticker.industry || null,
          ticker.market_cap || null,
        ]);
        inserted++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return inserted;
  }

  /**
   * Upsert price history record
   */
  async upsertPriceHistory(price: PriceHistory): Promise<void> {
    const sql = `
      INSERT INTO price_history (trade_date, ticker, close_price, c, h, l, o, v, vw)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (trade_date, ticker) DO UPDATE SET
        close_price = EXCLUDED.close_price,
        c = EXCLUDED.c,
        h = EXCLUDED.h,
        l = EXCLUDED.l,
        o = EXCLUDED.o,
        v = EXCLUDED.v,
        vw = EXCLUDED.vw
    `;
    await this.pool.query(sql, [
      price.trade_date,
      price.ticker,
      price.close_price,
      price.c || null,
      price.h || null,
      price.l || null,
      price.o || null,
      price.v || null,
      price.vw || null,
    ]);
  }

  /**
   * Bulk upsert price history records
   */
  async bulkUpsertPriceHistory(prices: PriceHistory[]): Promise<number> {
    if (prices.length === 0) return 0;

    const client = await this.pool.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const price of prices) {
        const sql = `
          INSERT INTO price_history (trade_date, ticker, close_price, c, h, l, o, v, vw)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (trade_date, ticker) DO UPDATE SET
            close_price = EXCLUDED.close_price,
            c = EXCLUDED.c,
            h = EXCLUDED.h,
            l = EXCLUDED.l,
            o = EXCLUDED.o,
            v = EXCLUDED.v,
            vw = EXCLUDED.vw
        `;
        await client.query(sql, [
          price.trade_date,
          price.ticker,
          price.close_price,
          price.c || null,
          price.h || null,
          price.l || null,
          price.o || null,
          price.v || null,
          price.vw || null,
        ]);
        inserted++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return inserted;
  }

  /**
   * Get price history for a ticker
   */
  async getPriceHistory(ticker: string, fromDate: string, toDate: string): Promise<PriceHistory[]> {
    const sql = `
      SELECT trade_date, ticker, close_price, c, h, l, o, v, vw
      FROM price_history
      WHERE ticker = $1 AND trade_date BETWEEN $2 AND $3
      ORDER BY trade_date ASC
    `;
    const result = await this.pool.query(sql, [ticker, fromDate, toDate]);
    return result.rows.map((row) => ({
      ...row,
      trade_date: row.trade_date.toISOString().split('T')[0],
    }));
  }

  /**
   * Get ticker metadata
   */
  async getTickerMetadata(ticker: string): Promise<TickerMetadata | null> {
    const sql = `SELECT * FROM ticker_metadata WHERE ticker = $1`;
    const result = await this.pool.query(sql, [ticker]);
    return result.rows[0] || null;
  }

  /**
   * Get all tickers in a sector (for peer comparison)
   */
  async getTickersBySector(sector: string): Promise<TickerMetadata[]> {
    const sql = `SELECT * FROM ticker_metadata WHERE sector = $1 ORDER BY market_cap DESC`;
    const result = await this.pool.query(sql, [sector]);
    return result.rows;
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default DatabaseService;
