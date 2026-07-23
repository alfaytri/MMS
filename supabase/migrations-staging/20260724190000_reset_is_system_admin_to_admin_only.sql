-- is_system_admin was set TRUE on every seeded role by the fresh_db_bootstrap
-- migration (Admin, field_rp, inventory_manager, and every approval-slot role
-- like Purchase Manager / Accountant). That reflected the OLD semantic of the
-- column ("seeded role, don't allow deletion").
--
-- After the 2026-07-24 rename to is_system_admin, downstream code
-- (usePermissions, requirePermission, RoutePermissionGuard) treats the flag
-- as "bypass every permission check" — so anyone assigned even field_rp or
-- Accountant became a de-facto full admin and could see every nav item.
--
-- Fix: only the actual Admin role keeps is_system_admin = true. Every other
-- seeded role gets its bypass revoked; those users are gated by the
-- permissions[] array their role holds, like any custom role.

BEGIN;

-- Match by the `system.admin` permission (uniquely held by the Admin role
-- per the seed migration and the comment in WhAdjustmentDetailDialog),
-- not by role name — staging may have a differently-named Admin role.
UPDATE public.custom_roles
SET    is_system_admin = false
WHERE  is_system_admin = true
  AND  NOT ('system.admin' = ANY(permissions));

-- Sanity check: at least one Admin role must remain flagged, otherwise a
-- fresh reset would ship without any full-access role and the app becomes
-- unusable.
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   public.custom_roles
  WHERE  is_system_admin = true
    AND  deleted_at IS NULL;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'refuse to leave no is_system_admin role — Admin role missing or already flagged false';
  END IF;

  RAISE NOTICE '% role(s) remain flagged is_system_admin=true', v_count;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
