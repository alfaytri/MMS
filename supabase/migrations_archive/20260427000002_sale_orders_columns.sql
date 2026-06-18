-- supabase/migrations/20260427000002_sale_orders_columns.sql
BEGIN;

-- Extend sale_order_status enum
ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- Dedicated columns on sale_orders
ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS currency             TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN IF NOT EXISTS exchange_rate        NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_delivery    DATE,
  ADD COLUMN IF NOT EXISTS payment_terms        TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_notes  TEXT,
  ADD COLUMN IF NOT EXISTS payment_milestones   JSONB,
  ADD COLUMN IF NOT EXISTS delivery_terms       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_terms_notes TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes       TEXT,
  ADD COLUMN IF NOT EXISTS validity_days        INTEGER NOT NULL DEFAULT 30;

-- Dedicated columns on sale_order_lines
-- DEFAULT 0 on avg_cost is critical: NULL avg_cost breaks margin SQL aggregations.
ALTER TABLE sale_order_lines
  ADD COLUMN IF NOT EXISTS line_type          TEXT NOT NULL DEFAULT 'products',
  ADD COLUMN IF NOT EXISTS unit               TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS tool_asset_item_id UUID REFERENCES tool_asset_items(id),
  ADD COLUMN IF NOT EXISTS avg_cost           NUMERIC NOT NULL DEFAULT 0;

COMMIT;
