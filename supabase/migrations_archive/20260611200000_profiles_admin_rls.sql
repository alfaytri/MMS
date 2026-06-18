-- ════════════════════════════════════════════════════════════════════════════
-- Tighten profiles RLS: replace wide-open FOR ALL with proper role checks
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Create a reusable admin permission check function.
--    Admin = user has a custom_role with is_system=true
--           OR has 'master_data.users.manage' permission.
--    SECURITY DEFINER so it can read user_custom_roles / custom_roles
--    regardless of their own RLS policies.
CREATE OR REPLACE FUNCTION public.has_admin_permission()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_custom_roles ur ON ur.profile_id = p.id
    JOIN public.custom_roles      cr ON cr.id        = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (
        cr.is_system = true
        OR 'master_data.users.manage' = ANY (cr.permissions)
      )
  );
$$;

-- 2. Drop the over-permissive FOR ALL policy
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- 3. SELECT: all authenticated users can read all profiles
--    (needed for lookups, dropdowns, assignee lists, etc.)
CREATE POLICY profiles_select_all
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 4. INSERT: users can create their own profile row only
CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- 5. UPDATE: admins can update any profile; regular users can update their own
CREATE POLICY profiles_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR public.has_admin_permission()
)
WITH CHECK (
  auth_user_id = (SELECT auth.uid())
  OR public.has_admin_permission()
);

-- 6. DELETE: admins only (regular users should never delete profiles)
CREATE POLICY profiles_delete_admin
ON public.profiles
FOR DELETE
TO authenticated
USING (public.has_admin_permission());
