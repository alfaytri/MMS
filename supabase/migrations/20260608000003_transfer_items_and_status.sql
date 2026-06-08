-- supabase/migrations/20260608000003_transfer_items_and_status.sql

-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block
ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Wrap remaining DDL in a transaction
BEGIN;

-- ── Normalized transfer items table ────────────────────────────────────
CREATE TABLE warehouse_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  item_name TEXT NOT NULL,
  sku TEXT,
  requested_qty INT NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  dispatched_qty INT,
  received_qty INT,
  shrinkage_qty INT NOT NULL DEFAULT 0,
  shrinkage_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;

-- SELECT only — all mutations go through SECURITY DEFINER RPCs
CREATE POLICY "Authenticated users can read warehouse_transfer_items"
  ON warehouse_transfer_items FOR SELECT TO authenticated USING (true);

-- ── Extend warehouse_transfers with dispatch/receive fields ────────────
ALTER TABLE warehouse_transfers
  ADD COLUMN IF NOT EXISTS dispatched_by_profile_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS dispatched_by_name TEXT,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by_profile_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS received_by_name TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_profile_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ── Circular transfer prevention ───────────────────────────────────────
ALTER TABLE warehouse_transfers
  ADD CONSTRAINT check_different_warehouses
  CHECK (from_warehouse_id != to_warehouse_id);

-- ── Make old JSONB items column nullable (deprecated) ──────────────────
ALTER TABLE warehouse_transfers ALTER COLUMN items DROP NOT NULL;

-- ── Migrate existing JSONB items into normalized table ─────────────────
INSERT INTO warehouse_transfer_items (transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost)
SELECT
  t.id,
  (item->>'brand_variant_id')::UUID,
  COALESCE(item->>'item_name', ''),
  item->>'sku',
  COALESCE((item->>'qty')::INT, 0),
  COALESCE((item->>'unit_cost')::NUMERIC, 0)
FROM warehouse_transfers t,
     jsonb_array_elements(t.items) AS item
WHERE t.items IS NOT NULL AND jsonb_array_length(t.items) > 0;

COMMIT;
