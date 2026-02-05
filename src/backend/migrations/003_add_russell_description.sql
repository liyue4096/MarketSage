-- Migration: Add description column to russell_1000 table
-- This column stores a brief introduction (~100 words) about each company

ALTER TABLE russell_1000
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for quick lookups of tickers without descriptions
CREATE INDEX IF NOT EXISTS idx_russell_1000_no_description
ON russell_1000(ticker)
WHERE description IS NULL;
