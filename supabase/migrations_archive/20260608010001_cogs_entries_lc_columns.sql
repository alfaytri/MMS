-- LC-COGS Attribution: cogs_entries gets landed_cost_id + notes, loose mutual-exclusivity check,
-- drops sign constraints (reversal rows store negative values).

BEGIN;

ALTER TABLE cogs_entries
  ADD COLUMN landed_cost_id UUID REFERENCES landed_costs(id),
  ADD COLUMN notes TEXT;

-- Drop sign constraints — reversal rows store negative qty and total_cost.
-- The constraint names follow Postgres auto-naming: <table>_<column>_check.
ALTER TABLE cogs_entries DROP CONSTRAINT IF EXISTS cogs_entries_qty_check;
ALTER TABLE cogs_entries DROP CONSTRAINT IF EXISTS cogs_entries_total_cost_check;

-- Loose mutual-exclusivity: row cannot be BOTH a sale and an LC adjustment.
-- A row MAY be neither (legacy data / future manual adjustments) — so the ALTER cannot
-- crash on any existing row shape.
ALTER TABLE cogs_entries
  ADD CONSTRAINT cogs_entries_source_check
  CHECK (NOT (sale_delivery_id IS NOT NULL AND landed_cost_id IS NOT NULL));

-- Partial index on LC adjustments — small, fast lookups for the tooltip and revert paths.
CREATE INDEX IF NOT EXISTS idx_cogs_entries_lc
  ON cogs_entries(landed_cost_id)
  WHERE landed_cost_id IS NOT NULL;

-- Retune the existing delivery index to be partial — LC rows have NULL there.
DROP INDEX IF EXISTS idx_cogs_delivery;
CREATE INDEX idx_cogs_delivery
  ON cogs_entries(sale_delivery_id)
  WHERE sale_delivery_id IS NOT NULL;

COMMIT;
