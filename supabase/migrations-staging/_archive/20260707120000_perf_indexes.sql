-- Performance indexes identified by the 2026-07-07 response-time audit.
-- All CREATE INDEX IF NOT EXISTS — safe to re-run.

-- C11: useInventoryCheckAssignments queries by check_id + ordered by created_at
CREATE INDEX IF NOT EXISTS idx_inventory_check_assignments_check_id
  ON inventory_check_assignments(check_id, created_at);

-- C4: useWarehouseTransfers ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_created_at
  ON warehouse_transfers(created_at DESC);

-- C5: useStockAdjustments ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_at
  ON stock_adjustments(created_at DESC);

-- C6: useInventoryChecks ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_inventory_checks_created_at
  ON inventory_checks(created_at DESC);

-- C2: useLandedCosts ordered by date DESC
CREATE INDEX IF NOT EXISTS idx_landed_costs_date
  ON landed_costs(date DESC);

-- M2: useReceivalsForLcSelector joins on po_id
CREATE INDEX IF NOT EXISTS idx_receivals_po_id
  ON receivals(po_id);

-- M3: useReceivalItemsBatch .in('receival_id', ids)
CREATE INDEX IF NOT EXISTS idx_receival_items_receival_id
  ON receival_items(receival_id);
