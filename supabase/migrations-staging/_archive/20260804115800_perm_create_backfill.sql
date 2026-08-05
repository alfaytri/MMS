-- Category Attributes + 3-state Permission Split — Task 0.4 backfill
--
-- Grants `X.create` to every custom_role that currently holds `X.manage`
-- (or `X.edit`). Preserves every existing workflow on deploy day — Owners
-- can trim `.create` off specific roles afterward via the Permissions tab.
--
-- Semantics of the model (from src/lib/permissions.ts):
--   .view   — read the surface
--   .create — insert new records
--   .edit   — modify / delete existing records (`.manage` is retained as alias)
--
-- Before this migration, most non-admin roles held `X.manage` which used to
-- grant BOTH create and edit ability. After Task 0.5 gates New-X buttons on
-- .create explicitly, a `.manage`-only role would silently lose the ability
-- to create. This migration ensures that does not happen — every role holding
-- .manage or .edit on an area also gets .create on the same area.
--
-- No-op for system_admin roles (system.admin bypasses every check anyway).
-- Idempotent — running twice is safe (union collapses duplicates).

BEGIN;

UPDATE public.custom_roles cr
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT p FROM (
      -- Original keys
      SELECT unnest(cr.permissions) AS p
      UNION
      -- Every .manage or .edit produces a matching .create sibling
      SELECT regexp_replace(k, '\.(edit|manage)$', '.create')
      FROM unnest(cr.permissions) k
      WHERE k LIKE '%.edit' OR k LIKE '%.manage'
    ) t
    WHERE p IS NOT NULL
    ORDER BY p
  )
)
WHERE NOT is_system_admin
  AND EXISTS (
    SELECT 1 FROM unnest(cr.permissions) k
    WHERE k LIKE '%.edit' OR k LIKE '%.manage'
  );

-- Audit hint — surfaces a row count in the CLI output.
DO $$
DECLARE
  affected int;
BEGIN
  SELECT count(*) INTO affected
  FROM public.custom_roles
  WHERE NOT is_system_admin
    AND EXISTS (
      SELECT 1 FROM unnest(permissions) k
      WHERE k LIKE '%.create'
    );
  RAISE NOTICE 'Perm .create backfill — % non-admin role(s) now hold at least one .create key', affected;
END $$;

COMMIT;
