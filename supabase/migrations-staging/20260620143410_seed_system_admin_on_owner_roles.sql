-- Seed the `system.admin` permission key on every role that currently
-- has `is_system = true`. This makes the full-access bypass authorable
-- from the role-edit UI (toggle "Full System Access (Owner)" in the
-- System module) instead of being DB-only via the is_system column.
--
-- Both mechanisms are checked in code now (usePermissions hook +
-- requireAdmin/requirePermission server gates + admin layout):
--   is_system = true OR permissions @> '{system.admin}' → bypass.

BEGIN;

UPDATE custom_roles
SET    permissions = permissions || ARRAY['system.admin']
WHERE  deleted_at IS NULL
  AND  is_system = true
  AND  NOT ('system.admin' = ANY(permissions));

COMMIT;
