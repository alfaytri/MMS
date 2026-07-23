-- Convert custom_roles.is_warehouse_responsible from a boolean column to a
-- permission entry (`warehouse.responsible_person`) in the roles.permissions
-- text[] array. Any role can now be granted the RP capability via the normal
-- permission tree UI instead of a hidden column-level checkbox.
--
-- The is_field_rp_of(profile, warehouse) RPC only checks membership in the
-- warehouse_responsible_persons join table today — it doesn't read the
-- boolean — so no RPC body needs updating. The frontend
-- (useWarehouseResponsiblePersons + RoleFormDialog) is the only remaining
-- consumer of the boolean, and it moves to the permission in the same commit.

BEGIN;

-- Backfill: any role currently marked as a warehouse RP gets the new
-- permission appended (idempotent — the NOT check keeps duplicates out).
UPDATE public.custom_roles
SET    permissions = array_append(permissions, 'warehouse.responsible_person')
WHERE  is_warehouse_responsible = true
  AND  NOT ('warehouse.responsible_person' = ANY(permissions));

ALTER TABLE public.custom_roles
  DROP COLUMN IF EXISTS is_warehouse_responsible;

NOTIFY pgrst, 'reload schema';

COMMIT;
