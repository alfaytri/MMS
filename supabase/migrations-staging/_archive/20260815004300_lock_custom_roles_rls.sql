-- Six-Domains Fix C2 (CRITICAL security): custom_roles + user_custom_roles
-- RLS was USING(true) WITH CHECK(true) for authenticated → any logged-in user
-- could INSERT a role with is_system_admin=true, assign it to themselves,
-- and gain full admin access via the anon key alone.
--
-- Fix: replace the permissive write policies with policies that require the
-- caller to already hold `master_data.roles.manage` (or `system.admin`).
-- SELECT stays open so users can still see role names in dropdowns.

-- Helper: does the CURRENT auth user hold the given permission?
-- Uses _user_has_permission on the caller's profile_id derived from auth.uid().
CREATE OR REPLACE FUNCTION public._auth_user_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_data ud
    WHERE ud.auth_user_id = auth.uid()
      AND public._user_has_permission(ud.id, p_permission)
  );
$$;

REVOKE ALL ON FUNCTION public._auth_user_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._auth_user_has_permission(text) TO authenticated;

-- ── custom_roles ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage custom_roles" ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles_read_all"          ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles_manage"            ON public.custom_roles;

CREATE POLICY "custom_roles_read_all"
  ON public.custom_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "custom_roles_manage_insert"
  ON public.custom_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public._auth_user_has_permission('master_data.roles.manage'));

CREATE POLICY "custom_roles_manage_update"
  ON public.custom_roles
  FOR UPDATE
  TO authenticated
  USING      (public._auth_user_has_permission('master_data.roles.manage'))
  WITH CHECK (public._auth_user_has_permission('master_data.roles.manage'));

CREATE POLICY "custom_roles_manage_delete"
  ON public.custom_roles
  FOR DELETE
  TO authenticated
  USING (public._auth_user_has_permission('master_data.roles.manage'));

-- ── user_custom_roles ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage user_custom_roles" ON public.user_custom_roles;
DROP POLICY IF EXISTS "user_custom_roles_read_all"          ON public.user_custom_roles;
DROP POLICY IF EXISTS "user_custom_roles_manage"            ON public.user_custom_roles;

CREATE POLICY "user_custom_roles_read_all"
  ON public.user_custom_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "user_custom_roles_manage_insert"
  ON public.user_custom_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public._auth_user_has_permission('master_data.roles.manage'));

CREATE POLICY "user_custom_roles_manage_update"
  ON public.user_custom_roles
  FOR UPDATE
  TO authenticated
  USING      (public._auth_user_has_permission('master_data.roles.manage'))
  WITH CHECK (public._auth_user_has_permission('master_data.roles.manage'));

CREATE POLICY "user_custom_roles_manage_delete"
  ON public.user_custom_roles
  FOR DELETE
  TO authenticated
  USING (public._auth_user_has_permission('master_data.roles.manage'));
