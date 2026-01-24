-- MarketSage Database Schema
-- Migration 002: Create MA signals table for storing moving average crossover signals

-- Table: ma_signals (Moving Average Crossover Signals)
-- Stores 20-day, 60-day, and 250-day MA crossover signals for each ticker per date
-- Signal values: 'CROSS_ABOVE' | 'CROSS_BELOW' | 'NONE'
CREATE TABLE IF NOT EXISTS ma_signals (
    signal_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    ma_20_signal VARCHAR(20),       -- Signal for 20-day MA: CROSS_ABOVE, CROSS_BELOW, NONE
    ma_60_signal VARCHAR(20),       -- Signal for 60-day MA: CROSS_ABOVE, CROSS_BELOW, NONE
    ma_250_signal VARCHAR(20),      -- Signal for 250-day MA: CROSS_ABOVE, CROSS_BELOW, NONE
    close_price NUMERIC(12, 4),     -- Close price at signal date
    sma_20 NUMERIC(12, 4),          -- 20-day SMA value at signal date
    sma_60 NUMERIC(12, 4),          -- 60-day SMA value at signal date
    sma_250 NUMERIC(12, 4),         -- 250-day SMA value at signal date
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (signal_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (signal_date);

-- Create partitions for ma_signals table (years 2025-2030)
CREATE TABLE IF NOT EXISTS ma_signals_2025 PARTITION OF ma_signals
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS ma_signals_2026 PARTITION OF ma_signals
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS ma_signals_2027 PARTITION OF ma_signals
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS ma_signals_2028 PARTITION OF ma_signals
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS ma_signals_2029 PARTITION OF ma_signals
    FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS ma_signals_2030 PARTITION OF ma_signals
    FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ma_signals_ticker ON ma_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_ma_signals_date_desc ON ma_signals(signal_date DESC);

-- Index for finding active signals (non-NONE) - partial index for efficiency
CREATE INDEX IF NOT EXISTS idx_ma_signals_active_20 ON ma_signals(signal_date, ticker)
    WHERE ma_20_signal != 'NONE' AND ma_20_signal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ma_signals_active_60 ON ma_signals(signal_date, ticker)
    WHERE ma_60_signal != 'NONE' AND ma_60_signal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ma_signals_active_250 ON ma_signals(signal_date, ticker)
    WHERE ma_250_signal != 'NONE' AND ma_250_signal IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE ma_signals IS 'Stores daily moving average crossover signals for Russell 1000 tickers';
COMMENT ON COLUMN ma_signals.ma_20_signal IS 'CROSS_ABOVE=price crossed above SMA20, CROSS_BELOW=price crossed below SMA20, NONE=no crossover';
COMMENT ON COLUMN ma_signals.ma_60_signal IS 'CROSS_ABOVE=price crossed above SMA60, CROSS_BELOW=price crossed below SMA60, NONE=no crossover';
COMMENT ON COLUMN ma_signals.ma_250_signal IS 'CROSS_ABOVE=price crossed above SMA250, CROSS_BELOW=price crossed below SMA250, NONE=no crossover';
