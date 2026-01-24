# MarketSage Improvements Plan

## Overview
Four improvements to enhance the signal generation and storage system.

---

## 1. DynamoDB Primary Key Restructure

**Current**:
- PK: `TICKER#ticker`, SK: `DATE#date#signature`

**Problem**:
- Want to generate new reports for same ticker on different dates
- Need composite PK of ticker + date for uniqueness

**Solution**:
- Change to single PK: `{ticker}#{date}` (e.g., `ALM#2026-01-23`)
- SK: `{thoughtSignature}` (allows multiple analyses per day if needed)
- GSI1: For querying by signature (retro-exam)
- GSI2: For querying all analyses for a ticker sorted by date

**Files to modify**:
- `src/backend/lambda/analysis-store/index.ts`
- `src/CDK/marketsage-infra/lib/marketsage-infra-stack.ts` (if needed)

---

## 2. Add 20-Day Moving Average Signal

**Current**: Only 60-day and 250-day MA signals

**Solution**:
- Add 20-day MA calculation to price analysis
- Include in signal generation logic

**Files to modify**:
- `src/backend/lambda/market-snap/index.ts` (add 20ma calculation)
- Any signal detection logic

---

## 3. Scheduled Market Snap at 4:30 PM ET Weekdays

**Solution**:
- Use EventBridge rule with cron: `cron(30 21 ? * MON-FRI *)` (4:30 PM ET = 21:30 UTC)
- Market snap should process all tickers in `russell_1000` table
- Generate signals for 20ma, 60ma, 250ma

**Files to modify**:
- `src/CDK/marketsage-infra/lib/marketsage-infra-stack.ts` (add EventBridge rule)
- `src/backend/lambda/market-snap/index.ts` (batch processing logic)

---

## 4. Aurora Table for MA Signals

**New Table**: `ma_signals`

**Schema**:
```sql
CREATE TABLE ma_signals (
    id SERIAL PRIMARY KEY,
    signal_date DATE NOT NULL,
    ticker VARCHAR(10) NOT NULL,
    ma_20_signal VARCHAR(20),      -- 'CROSS_ABOVE', 'CROSS_BELOW', 'NONE'
    ma_60_signal VARCHAR(20),
    ma_250_signal VARCHAR(20),
    price_at_signal DECIMAL(12, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(signal_date, ticker)
);

CREATE INDEX idx_ma_signals_ticker ON ma_signals(ticker);
CREATE INDEX idx_ma_signals_date ON ma_signals(signal_date DESC);
```

**Signal Values**:
- `CROSS_ABOVE` - Price crossed above MA
- `CROSS_BELOW` - Price crossed below MA
- `NONE` - No crossover detected

**Files to create/modify**:
- `migrations/002_create_ma_signals.sql`
- Signal storage Lambda or modify market-snap

---

## Implementation Order

1. **Task 4** (Aurora table) - Create schema first
2. **Task 2** (20ma signal) - Add calculation logic
3. **Task 3** (Scheduler) - Set up EventBridge + batch processing
4. **Task 1** (DynamoDB PK) - Restructure after other changes settle

---

## Current Status

- [x] Task 1: DynamoDB PK restructure - `analysis-store/index.ts` updated (PK: `ticker#date`, SK: `thoughtSignature`)
- [x] Task 2: Add 20-day MA signal - Included in `market-snap/index.ts` (detects 20, 60, 250 MA crossovers)
- [x] Task 3: Scheduled market snap (4:30 PM ET weekdays) - EventBridge rule in CDK stack
- [x] Task 4: Aurora ma_signals table - Migration in `migrations/002_create_ma_signals.sql` + embedded in data-loader

## Files Created/Modified

- `src/backend/lambda/market-snap/index.ts` - NEW: Generates MA signals for Russell 1000
- `src/backend/lambda/analysis-store/index.ts` - Updated PK structure
- `src/backend/migrations/002_create_ma_signals.sql` - NEW: Aurora table migration
- `src/backend/lambda/data-loader/index.ts` - Added ma_signals table to embedded migration
- `src/CDK/marketsage-infra/lib/marketsage-infra-stack.ts` - Added market-snap Lambda + EventBridge rule
