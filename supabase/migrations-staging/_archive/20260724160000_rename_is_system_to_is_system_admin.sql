-- Rename custom_roles.is_system → is_system_admin.
--
-- Note: the column flags every seeded role (Admin, field_rp, inventory_manager,
-- and the approval-slot roles), not only the Admin role. The rename matches
-- the caller intent — every downstream `is_system=true` check in usePermissions
-- and require-admin already treats these roles as system admins.

BEGIN;

ALTER TABLE public.custom_roles
  RENAME COLUMN is_system TO is_system_admin;

NOTIFY pgrst, 'reload schema';

COMMIT;
