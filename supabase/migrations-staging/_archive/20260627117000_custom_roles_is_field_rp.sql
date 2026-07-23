-- ─────────────────────────────────────────────────────────────────────────────
-- Promote "Field RP" from a hardcoded role name to a role-level toggle,
-- mirroring how `is_approval_slot` works.
--
-- Before: useFieldRPCandidates queried `custom_roles.name = 'field_rp'`. Only
-- the one role with that exact name qualified. Renaming it or having multiple
-- roles serve the same purpose (e.g. "Warehouse Manager" who is also a Field
-- RP) was impossible.
--
-- After: any custom_role with `is_field_rp = true` qualifies. Multiple roles
-- can be flagged. The role's name becomes informational.
--
-- The legacy `field_rp` role is auto-flagged so existing assignments continue
-- to surface as Field RP candidates without manual intervention.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS is_field_rp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_roles.is_field_rp IS
  'When TRUE, users holding this role appear as Field RP candidates in the Warehouse dialog. Mirrors is_approval_slot. Any role can be flagged; the legacy "field_rp" name is no longer special.';

-- Backfill: keep the existing field_rp role's behaviour
UPDATE public.custom_roles
SET    is_field_rp = true
WHERE  name = 'field_rp'
  AND  deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
