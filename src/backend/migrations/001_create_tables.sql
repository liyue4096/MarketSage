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
-- change=today's change from previous day, change_pct=change percentage (high precision)
-- prev_* columns store previous day's OHLCV from snapshot endpoint (optional)
CREATE TABLE IF NOT EXISTS price_history (
    trade_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    o NUMERIC(12,4),
    h NUMERIC(12,4),
    l NUMERIC(12,4),
    c NUMERIC(12,4) NOT NULL,
    v BIGINT,
    vw NUMERIC(12,4),
    change NUMERIC(18,10),       -- Today's change from previous day (high precision)
    change_pct NUMERIC(18,10),   -- Today's change percentage (high precision)
    -- Previous day OHLCV (optional, only from snapshot endpoint)
    prev_o NUMERIC(12,4),
    prev_h NUMERIC(12,4),
    prev_l NUMERIC(12,4),
    prev_c NUMERIC(12,4),
    prev_v BIGINT,
    prev_vw NUMERIC(12,4),
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
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change NUMERIC(18,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Alter change column to high precision
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN change TYPE NUMERIC(18,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add change_pct column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS change_pct NUMERIC(18,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Alter change_pct column to high precision
DO $$
BEGIN
    ALTER TABLE price_history ALTER COLUMN change_pct TYPE NUMERIC(18,10);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_o column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_o NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_h column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_h NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_l column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_l NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_c column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_c NUMERIC(12,4);
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_v column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_v BIGINT;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- Migration: Add prev_vw column if it doesn't exist
DO $$
BEGIN
    ALTER TABLE price_history ADD COLUMN IF NOT EXISTS prev_vw NUMERIC(12,4);
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

-- Table C: sma (Simple Moving Averages)
-- Stores 20-day, 60-day, and 250-day SMA values for each ticker per date
CREATE TABLE IF NOT EXISTS sma (
    trade_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    sma_20 NUMERIC(12,4),   -- 20-day Simple Moving Average
    sma_60 NUMERIC(12,4),   -- 60-day Simple Moving Average
    sma_250 NUMERIC(12,4),  -- 250-day Simple Moving Average
    last_updated TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (trade_date, ticker),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (trade_date);

-- Create partitions for SMA table (years 2020-2030)
CREATE TABLE IF NOT EXISTS sma_2020 PARTITION OF sma
    FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');

CREATE TABLE IF NOT EXISTS sma_2021 PARTITION OF sma
    FOR VALUES FROM ('2021-01-01') TO ('2022-01-01');

CREATE TABLE IF NOT EXISTS sma_2022 PARTITION OF sma
    FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');

CREATE TABLE IF NOT EXISTS sma_2023 PARTITION OF sma
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE IF NOT EXISTS sma_2024 PARTITION OF sma
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS sma_2025 PARTITION OF sma
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS sma_2026 PARTITION OF sma
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS sma_2027 PARTITION OF sma
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS sma_2028 PARTITION OF sma
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS sma_2029 PARTITION OF sma
    FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS sma_2030 PARTITION OF sma
    FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

-- Create index on ticker for fast lookups
CREATE INDEX IF NOT EXISTS idx_sma_ticker ON sma(ticker);

-- ============================================================
-- GAN Analysis Tables (Adversarial Engine Results)
-- ============================================================

-- Table D: analysis_reports (The Final Verdicts)
-- Stores the complete GAN loop output for each triggered stock
CREATE TABLE IF NOT EXISTS analysis_reports (
    id SERIAL,
    ticker VARCHAR(10) NOT NULL,
    trigger_date DATE NOT NULL,
    trigger_type VARCHAR(10) NOT NULL,  -- '60MA' or '250MA'
    close_price NUMERIC(12,4) NOT NULL,
    verdict VARCHAR(20) NOT NULL,       -- 'Strong Buy', 'Neutral', 'Short'
    confidence INTEGER NOT NULL,        -- 1-10 scale
    primary_catalyst TEXT NOT NULL,
    consensus_summary JSONB NOT NULL,   -- Array of 3 summary points
    report_content TEXT NOT NULL,       -- Executive summary
    thought_signature VARCHAR(100) NOT NULL UNIQUE,  -- For Retro-Exam lookup
    appendix TEXT,                      -- Full thinking trace
    peers JSONB,                        -- Array of peer tickers used
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id),
    FOREIGN KEY (ticker) REFERENCES ticker_metadata(ticker)
) PARTITION BY RANGE (trigger_date);

-- Create partitions for analysis_reports (years 2025-2030)
CREATE TABLE IF NOT EXISTS analysis_reports_2025 PARTITION OF analysis_reports
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS analysis_reports_2026 PARTITION OF analysis_reports
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS analysis_reports_2027 PARTITION OF analysis_reports
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS analysis_reports_2028 PARTITION OF analysis_reports
    FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');

CREATE TABLE IF NOT EXISTS analysis_reports_2029 PARTITION OF analysis_reports
    FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');

CREATE TABLE IF NOT EXISTS analysis_reports_2030 PARTITION OF analysis_reports
    FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

-- Create indexes for analysis_reports
CREATE INDEX IF NOT EXISTS idx_analysis_reports_ticker ON analysis_reports(ticker);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_trigger_date ON analysis_reports(trigger_date);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_thought_signature ON analysis_reports(thought_signature);

-- Table E: analysis_theses (Bull & Bear Arguments)
-- Stores individual thesis points from each agent
CREATE TABLE IF NOT EXISTS analysis_theses (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL,
    role VARCHAR(10) NOT NULL,          -- 'BULL' or 'BEAR'
    round INTEGER NOT NULL,             -- 1 (opening), 3 (final defense)
    thesis_points JSONB NOT NULL,       -- Array of {point, evidence, confidence}
    primary_driver TEXT NOT NULL,       -- primaryCatalyst (Bull) or primaryRisk (Bear)
    thinking_trace TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on report_id for joins
CREATE INDEX IF NOT EXISTS idx_analysis_theses_report_id ON analysis_theses(report_id);

-- Table F: analysis_rebuttals (Cross-examination)
-- Stores rebuttals from Round 2
CREATE TABLE IF NOT EXISTS analysis_rebuttals (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL,
    bull_rebuttals JSONB NOT NULL,      -- Array of {originalPoint, rebuttal, evidence, strengthOfRebuttal}
    bear_rebuttals JSONB NOT NULL,
    thinking_trace TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on report_id for joins
CREATE INDEX IF NOT EXISTS idx_analysis_rebuttals_report_id ON analysis_rebuttals(report_id);

-- Table G: retro_exams (Accountability Engine - T+60 Reviews)
-- Stores the retrospective analysis after 60 days
CREATE TABLE IF NOT EXISTS retro_exams (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL UNIQUE,
    thought_signature VARCHAR(100) NOT NULL,
    exam_date DATE NOT NULL,            -- trigger_date + 60 days
    actual_price NUMERIC(12,4),         -- Price at T+60
    price_change_pct NUMERIC(8,4),      -- Actual performance
    logic_accuracy_score INTEGER,       -- 1-100
    review_content TEXT,                -- AI analysis of what went right/wrong
    winner VARCHAR(10),                 -- 'BULL' or 'BEAR' based on outcome
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (report_id) REFERENCES analysis_reports(id)
);

-- Create index for retro_exam lookups
CREATE INDEX IF NOT EXISTS idx_retro_exams_thought_signature ON retro_exams(thought_signature);
CREATE INDEX IF NOT EXISTS idx_retro_exams_exam_date ON retro_exams(exam_date);
