-- supabase/migrations/20260425000060_lc_columns.sql

-- Add lifecycle columns to landed_costs
ALTER TABLE landed_costs
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT,
  ADD COLUMN IF NOT EXISTS applied_at    TIMESTAMPTZ;

-- Allow 'cost_adjustment' movement type
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival',
    'sale_delivery',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'cost_adjustment'
  ));
