-- Add 'free_receival' to the allowed movement types for free items
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment', 'receival_edit',
    'free_receival'
  ));
