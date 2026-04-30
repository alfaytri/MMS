-- supabase/migrations/20260428200001_division_isolation.sql

-- ─── 0. Extend approval_role enum ────────────────────────────────────────────
ALTER TYPE approval_role ADD VALUE IF NOT EXISTS 'employee';

-- ─── 1. Add division_id to order tables ────────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

ALTER TABLE sale_orders
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

-- ─── 2. Backfill from creator's primary division ───────────────────────────────
-- created_by is a UUID FK → profiles(id), so join directly on profiles.id
-- NOTE: This backfill is non-deterministic when a user has multiple user_divisions rows.
-- Migration 20260428200002 re-runs the backfill deterministically for rows left NULL.
-- Migration 20260428200003 re-runs deterministically for all rows (corrects arbitrary picks).
UPDATE purchase_orders po
SET    division_id = ud.division_id
FROM   user_divisions ud
WHERE  ud.profile_id = po.created_by::UUID
  AND  po.division_id IS NULL;

UPDATE sale_orders so
SET    division_id = ud.division_id
FROM   user_divisions ud
WHERE  ud.profile_id = so.created_by::UUID
  AND  so.division_id IS NULL;

-- ─── 3. JWT Auth Hook ──────────────────────────────────────────────────────────
-- Register this in Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- user_type is derived from approval_role_assignments (not profiles.user_type):
--   owner/accountant        → super-viewer (bypasses division filter)
--   purchase_manager/employee/no role → scoped to assigned divisions
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  -- Priority: owner > accountant > purchase_manager > employee.
  -- Having 'owner' in ANY division grants global super-viewer access.
  -- If per-division role scoping is ever needed, this hook must be redesigned.
  SELECT
    CASE
      WHEN bool_or(ara.role = 'owner')            THEN 'owner'
      WHEN bool_or(ara.role = 'accountant')        THEN 'accountant'
      WHEN bool_or(ara.role = 'purchase_manager') THEN 'purchase_manager'
      WHEN bool_or(ara.role = 'employee')          THEN 'employee'
      ELSE 'employee'
    END,
    ARRAY_AGG(DISTINCT ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN approval_role_assignments ara
         ON ara.profile_id = p.id AND ara.deleted_at IS NULL
  LEFT JOIN user_divisions ud ON ud.profile_id = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.id;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, 'employee')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ─── 4. Shared RLS helper ──────────────────────────────────────────────────────
-- NULL division_id: NULL = ANY(...) evaluates to NULL (falsy) — regular users
-- cannot see unassigned rows. Owners/accountants bypass via the first OR clause.
-- This is intentional: legacy rows with no division are owner/accountant-only
-- until explicitly backfilled.
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    row_division_id = ANY(
      ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    )
  );
$$;

-- ─── 5. RLS policies — purchase_orders ────────────────────────────────────────
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "division_scope_select" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_insert" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_update" ON purchase_orders;
DROP POLICY IF EXISTS "division_scope_delete" ON purchase_orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON purchase_orders;
DROP POLICY IF EXISTS "Allow all" ON purchase_orders;

CREATE POLICY "division_scope_select" ON purchase_orders
  FOR SELECT USING (is_division_visible(division_id));

CREATE POLICY "division_scope_insert" ON purchase_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

CREATE POLICY "division_scope_update" ON purchase_orders
  FOR UPDATE USING (is_division_visible(division_id));

CREATE POLICY "division_scope_delete" ON purchase_orders
  FOR DELETE USING (is_division_visible(division_id));

-- ─── 6. RLS policies — sale_orders ────────────────────────────────────────────
ALTER TABLE sale_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "division_scope_select" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_insert" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_update" ON sale_orders;
DROP POLICY IF EXISTS "division_scope_delete" ON sale_orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON sale_orders;
DROP POLICY IF EXISTS "Allow all" ON sale_orders;

CREATE POLICY "division_scope_select" ON sale_orders
  FOR SELECT USING (is_division_visible(division_id));

CREATE POLICY "division_scope_insert" ON sale_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

CREATE POLICY "division_scope_update" ON sale_orders
  FOR UPDATE USING (is_division_visible(division_id));

CREATE POLICY "division_scope_delete" ON sale_orders
  FOR DELETE USING (is_division_visible(division_id));
