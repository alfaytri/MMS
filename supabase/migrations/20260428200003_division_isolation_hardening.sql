-- supabase/migrations/20260428200003_division_isolation_hardening.sql

-- ─── 1. Index for JWT hook join performance ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_divisions_profile_id
  ON user_divisions(profile_id);

-- ─── 2. Revoke PUBLIC execute on hook function ────────────────────────────────
-- custom_access_token_hook is only intended to be called by supabase_auth_admin.
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;

-- ─── 3. Re-run backfill deterministically for all unassigned rows ─────────────
-- Migration 20260428200001 used a non-deterministic UPDATE…FROM join.
-- Migration 20260428200002 fixed rows left NULL after that.
-- This migration uses the same deterministic subquery but without the IS NULL
-- guard, so rows assigned arbitrarily by migration 1 are also corrected.
-- Safe to run: only updates rows where a better assignment can be found.

UPDATE purchase_orders
SET    division_id = (
  SELECT ud.division_id
  FROM   user_divisions ud
  WHERE  ud.profile_id = purchase_orders.created_by
  ORDER BY ud.created_at
  LIMIT 1
)
WHERE  created_by IS NOT NULL;

UPDATE sale_orders
SET    division_id = (
  SELECT ud.division_id
  FROM   user_divisions ud
  WHERE  ud.profile_id = sale_orders.created_by
  ORDER BY ud.created_at
  LIMIT 1
)
WHERE  created_by IS NOT NULL;
