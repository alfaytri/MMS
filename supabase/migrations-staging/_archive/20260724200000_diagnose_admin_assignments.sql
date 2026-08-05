-- Diagnostic-only: logs which roles carry system.admin permission and
-- how many users are assigned to each role. Read the NOTICE output in the
-- CLI to see who has admin access and why. No data is modified.

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== Roles flagged is_system_admin=true ===';
  FOR r IN
    SELECT id, name, is_system_admin, ('system.admin' = ANY(permissions)) AS has_sysadmin_perm
    FROM   public.custom_roles
    WHERE  deleted_at IS NULL
      AND  (is_system_admin = true OR 'system.admin' = ANY(permissions))
    ORDER  BY name
  LOOP
    RAISE NOTICE 'role="%"  is_system_admin=%  has_system.admin_perm=%',
      r.name, r.is_system_admin, r.has_sysadmin_perm;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== Per-role user assignment counts ===';
  FOR r IN
    SELECT cr.name,
           cr.is_system_admin,
           ('system.admin' = ANY(cr.permissions)) AS has_sysadmin_perm,
           COUNT(ucr.profile_id) AS user_count
    FROM   public.custom_roles cr
    LEFT   JOIN public.user_custom_roles ucr ON ucr.role_id = cr.id
    WHERE  cr.deleted_at IS NULL
    GROUP  BY cr.id, cr.name, cr.is_system_admin, cr.permissions
    ORDER  BY user_count DESC, cr.name
  LOOP
    RAISE NOTICE 'role="%"  is_system_admin=%  has_system.admin_perm=%  users=%',
      r.name, r.is_system_admin, r.has_sysadmin_perm, r.user_count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== Users with any admin-granting role ===';
  FOR r IN
    SELECT DISTINCT ud.id, ud.email, ud.full_name, cr.name AS role_name
    FROM   public.user_data ud
    JOIN   public.user_custom_roles ucr ON ucr.profile_id = ud.id
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  cr.deleted_at IS NULL
      AND  (cr.is_system_admin = true OR 'system.admin' = ANY(cr.permissions))
    ORDER  BY ud.email
  LOOP
    RAISE NOTICE 'user="%" (%) via role="%"', r.email, r.full_name, r.role_name;
  END LOOP;
END $$;

ROLLBACK;  -- diagnostic only; never commit
