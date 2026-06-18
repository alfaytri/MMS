-- supabase/migrations/20260425000064_extend_movement_type.sql
BEGIN;

ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

-- Extends the constraint last modified in 20260425000060_lc_columns.sql to include 'receival_edit'
ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment', 'receival_edit'
  ));

COMMIT;
