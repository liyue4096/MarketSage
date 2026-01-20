-- MarketSage Database Schema
-- Migration 001: Create core tables

-- Table A: ticker_metadata (The Registry)
-- Source of Truth for company classification
CREATE TABLE IF NOT EXISTS ticker_metadata (
    ticker VARCHAR(10) PRIMARY KEY,
    name TEXT NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Create index on sector for peer lookups
CREATE INDEX IF NOT EXISTS idx_ticker_metadata_sector ON ticker_metadata(sector);

-- Table B: price_history (The Time-Series Core)
-- Stores daily snapshots, partitioned by trade_date (Yearly)
-- OHLCV format: o=open, h=high, l=low, c=close, v=volume, vw=volume weighted avg price
-- change=today's change from previous day, change_pct=change percentage
CREATE TABLE IF NOT EXISTS price_history (
    trade_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    o NUMERIC(12,4),
    h NUMERIC(12,4),
    l NUMERIC(12,4),
    c NUMERIC(12,4) NOT NULL,
    v BIGINT,
    vw NUMERIC(12,4),
    change NUMERIC(12,4),       -- Today's change from previous day
    change_pct NUMERIC(8,4),    -- Today's change percentage
    PRIMARY KEY (trade_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (trade_date);

-- Migration: Drop close_price column if it exists (it was redundant with c)
DO $$
BEGIN
    ALTER TABLE price_history DROP COLUMN IF EXISTS close_price;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Alter v column type if table already exists (for migrations)
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN v TYPE BIGINT;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change_pct column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change_pct NUMERIC(8,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Create partitions for years 2020-2030
CREATE TABLE IF NOT EXISTS price_history_2020 PARTITION OF price_history
    FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');

CREATE TABLE IF NOT EXISTS price_history_2021 PARTITION OF price_history
    FOR VALUES FROM ('2021-01-01') TO ('2022-01-01');

CREATE TABLE IF NOT EXISTS price_history_2022 PARTITION OF price_history
    FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');

CREATE TABLE IF NOT EXISTS price_history_2023 PARTITION OF price_history
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE IF NOT EXISTS price_history_2024 PARTITION OF price_history
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS price_history_2025 PARTITION OF price_history
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS price_history_2026 PARTITION OF price_history
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS price_history_2027 PARTITION OF price_history
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS price_history_2028 PARTITION OF price_history
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS price_history_2029 PARTITION OF price_history
    FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS price_history_2030 PARTITION OF price_history
    FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

-- Create index on ticker for fast lookups
CREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker);
