# 1. Database Schema Overview

The design follows a **Core & Archive** pattern. We use a single master table for prices with PostgreSQL Range Partitioning to ensure the 30-year history remains performant.

---

## Table A: `ticker_metadata` (The Registry)
This table acts as your "Source of Truth" for company classification. You fetch this data once (or refresh monthly) from Polygon.io.

| Column        | Type          | Constraints      | Description                                 |
|--------------|---------------|-----------------|---------------------------------------------|
| ticker       | VARCHAR(10)   | PRIMARY KEY     | Stock symbol (e.g., 'NVDA')                 |
| name         | TEXT          | NOT NULL        | Official company name                       |
| sector       | VARCHAR(100)  | INDEXED         | GICS Sector (The "Track")                   |
| industry     | VARCHAR(100)  |                 | Specific industry sub-group                 |
| market_cap   | BIGINT        |                 | Used to pick top 3 peers                    |
| last_updated | TIMESTAMP     | DEFAULT NOW()   | Tracking for metadata freshness              |

---

## Table B: `price_history` (The Time-Series Core)
This table stores daily snapshots. It is partitioned by `trade_date` (Yearly).

| Column       | Type           | Constraints         | Description                                    |
|--------------|---------------|---------------------|-----------------------------------------------|
| trade_date   | DATE          | PK (Part 1)         | The partition key                              |
| ticker       | VARCHAR(10)   | PK (Part 2), FK     | FK to ticker_metadata                          |
| close_price  | NUMERIC(12,4) | NOT NULL            | Final adjusted close                           |
| c            | NUMERIC(12,4) |                     | The close price for the symbol in the period   |
| h            | NUMERIC(12,4) |                     | The highest price for the symbol in the period |
| l            | NUMERIC(12,4) |                     | The lowest price for the symbol in the period  | 
| o            | NUMERIC(12,4) |                     | The open price for the symbol in the period   |
| v            | NUMERIC(12,4) |                     | The trading volume in the period               |
| vw           | NUMERIC(12,4) | optional            | The volume weighted average price              |
