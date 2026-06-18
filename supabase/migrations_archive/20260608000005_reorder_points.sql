-- supabase/migrations/20260608000005_reorder_points.sql
BEGIN;

CREATE TABLE warehouse_reorder_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id) ON DELETE CASCADE,
  reorder_point INT NOT NULL DEFAULT 0,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, brand_variant_id)
);

ALTER TABLE warehouse_reorder_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read warehouse_reorder_points"
  ON warehouse_reorder_points FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert warehouse_reorder_points"
  ON warehouse_reorder_points FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update warehouse_reorder_points"
  ON warehouse_reorder_points FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete warehouse_reorder_points"
  ON warehouse_reorder_points FOR DELETE TO authenticated USING (true);

COMMIT;
