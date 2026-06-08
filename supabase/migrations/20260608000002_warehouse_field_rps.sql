-- supabase/migrations/20260608000002_warehouse_field_rps.sql
BEGIN;

-- ── Junction table: many-to-many warehouses ↔ Field RPs ────────────────
CREATE TABLE warehouse_field_rps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, profile_id)
);

ALTER TABLE warehouse_field_rps ENABLE ROW LEVEL SECURITY;

-- SELECT only — mutations go through SECURITY DEFINER RPCs or server-side admin routes
CREATE POLICY "Authenticated users can read warehouse_field_rps"
  ON warehouse_field_rps FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies: useReplaceWarehouseFieldRPs uses the service-role
-- client via an API route, and RPCs use SECURITY DEFINER which bypasses RLS.

-- ── Drop old manager columns ──────────────────────────────────────────
-- manager_id references employees(id) — no longer needed
-- manager_profile_id references profiles(id) — replaced by junction table
ALTER TABLE warehouses DROP COLUMN IF EXISTS manager_id;
ALTER TABLE warehouses DROP COLUMN IF EXISTS manager_profile_id;

COMMIT;
