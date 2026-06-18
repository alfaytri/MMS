-- supabase/migrations/20260425000001_inventory_foundation.sql

BEGIN;

-- ─── New columns on existing tables ───────────────────────────────────────────

ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS reserved_qty INT NOT NULL DEFAULT 0;

ALTER TABLE fifo_cost_layers
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_fifo_warehouse ON fifo_cost_layers(brand_variant_id, warehouse_id);

ALTER TABLE receival_items
  ADD COLUMN IF NOT EXISTS brand_variant_id UUID REFERENCES inventory_brand_variants(id);

-- ─── inventory_stock_movements ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id     UUID REFERENCES warehouses(id),
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  item_name        TEXT NOT NULL,
  sku              TEXT,
  movement_type    TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out'
  )),
  qty              INT NOT NULL,
  unit_cost        NUMERIC NOT NULL DEFAULT 0,
  reference_type   TEXT,
  reference_id     UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal can read stock_movements" ON inventory_stock_movements;
CREATE POLICY "Internal can read stock_movements"
  ON inventory_stock_movements FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_mvmt_variant ON inventory_stock_movements(brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvmt_ref ON inventory_stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvmt_ref_id ON inventory_stock_movements(reference_id);

-- ─── cogs_entries ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cogs_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  sale_delivery_id UUID,
  sale_order_id    UUID,
  qty              INT NOT NULL CHECK (qty > 0),
  unit_cost        NUMERIC NOT NULL,
  total_cost       NUMERIC NOT NULL CHECK (total_cost >= 0),
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cogs_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal can read cogs_entries" ON cogs_entries;
CREATE POLICY "Internal can read cogs_entries"
  ON cogs_entries FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cogs_variant ON cogs_entries(brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_cogs_delivery ON cogs_entries(sale_delivery_id);
CREATE INDEX IF NOT EXISTS idx_cogs_variant_date ON cogs_entries(brand_variant_id, date);

-- ─── service_inventory ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID NOT NULL,
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  qty_per_service  NUMERIC NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, brand_variant_id)
);

ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal can manage service_inventory" ON service_inventory;
CREATE POLICY "Internal can manage service_inventory"
  ON service_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_service_inv_service ON service_inventory(service_id);
CREATE INDEX IF NOT EXISTS idx_service_inv_variant ON service_inventory(brand_variant_id);

COMMIT;
