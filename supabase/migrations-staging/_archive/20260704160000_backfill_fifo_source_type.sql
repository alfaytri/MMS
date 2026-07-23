-- Better backfill: identify source_type for existing layers by cross-referencing
-- inventory_stock_movements and other tables.

-- Layers from delivery cancellations: match by brand_variant_id + date + qty
-- against cogs_entries that have a sale_delivery_id
UPDATE fifo_cost_layers fcl
SET source_type = 'delivery_cancel'
WHERE fcl.source_type = 'unknown'
  AND fcl.receival_id IS NULL
  AND EXISTS (
    SELECT 1 FROM cogs_entries ce
    JOIN sale_deliveries sd ON sd.id = ce.sale_delivery_id
    WHERE ce.brand_variant_id = fcl.brand_variant_id
      AND sd.status = 'cancelled'
      AND ce.qty = fcl.qty
      AND ABS(ce.unit_cost - fcl.unit_cost) < 0.01
  );

-- Layers from warehouse transfers: match movements with 'transfer_in'
UPDATE fifo_cost_layers fcl
SET source_type = 'transfer'
WHERE fcl.source_type = 'unknown'
  AND fcl.receival_id IS NULL
  AND EXISTS (
    SELECT 1 FROM inventory_stock_movements ism
    WHERE ism.brand_variant_id = fcl.brand_variant_id
      AND ism.warehouse_id = fcl.warehouse_id
      AND ism.movement_type = 'transfer_in'
      AND ism.qty = fcl.qty
      AND ABS(ism.unit_cost - fcl.unit_cost) < 0.01
  );

-- Layers from adjustments: match movements with 'adjustment_in'
UPDATE fifo_cost_layers fcl
SET source_type = 'adjustment'
WHERE fcl.source_type = 'unknown'
  AND fcl.receival_id IS NULL
  AND EXISTS (
    SELECT 1 FROM inventory_stock_movements ism
    WHERE ism.brand_variant_id = fcl.brand_variant_id
      AND ism.warehouse_id = fcl.warehouse_id
      AND ism.movement_type = 'adjustment_in'
      AND ism.qty = fcl.qty
  );

-- Layers from stock checks: match movements with 'stock_check_in'
UPDATE fifo_cost_layers fcl
SET source_type = 'stock_check'
WHERE fcl.source_type = 'unknown'
  AND fcl.receival_id IS NULL
  AND EXISTS (
    SELECT 1 FROM inventory_stock_movements ism
    WHERE ism.brand_variant_id = fcl.brand_variant_id
      AND ism.warehouse_id = fcl.warehouse_id
      AND ism.movement_type = 'stock_check_in'
      AND ism.qty = fcl.qty
  );

-- Anything still unknown that has date = '2000-01-01' is a gap-fill from deduct_fifo_layers
UPDATE fifo_cost_layers
SET source_type = 'gap_fill'
WHERE source_type = 'unknown'
  AND receival_id IS NULL
  AND date = '2000-01-01';
