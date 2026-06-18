-- supabase/migrations/20260426000002_service_inventory_link_type.sql

BEGIN;

-- Step A: Add the new quantity column (populated from existing data)
ALTER TABLE service_inventory
  ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 1;

-- Step B: Sync existing data
UPDATE service_inventory SET quantity = qty_per_service;

-- Step C: Drop the old column
ALTER TABLE service_inventory
  DROP COLUMN IF EXISTS qty_per_service;

-- Step D: Add link behaviour columns
ALTER TABLE service_inventory
  ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (link_type IN ('consumable', 'select_one', 'install_all')),
  ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_label TEXT;

-- Step E: Index for type-filtering queries
CREATE INDEX IF NOT EXISTS idx_service_inv_link_type
  ON service_inventory(link_type);

COMMIT;
