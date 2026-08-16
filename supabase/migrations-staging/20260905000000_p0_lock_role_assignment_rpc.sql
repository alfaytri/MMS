-- P0 SECURITY FIX — privilege escalation via role-assignment RPC.
--
-- replace_user_custom_roles_v2 / replace_user_custom_roles are SECURITY DEFINER
-- with NO in-body access control (they DELETE + re-INSERT a user's custom roles).
-- DEFINER bypasses the user_custom_roles RLS (which requires roles.manage), and
-- both were EXECUTE-granted to `authenticated` (the 2026-08-05 relock granted
-- authenticated broadly). Net effect: ANY logged-in user could call the RPC
-- directly via the Data API and assign themselves the Owner/admin role.
--
-- The only legitimate caller is the server-side users API route
-- (src/app/api/users/[id]/route.ts + .../create/route.ts), which is admin-gated
-- (requireAdmin) and calls the RPC with the SERVICE ROLE client. So the fix is to
-- make the RPC callable by service_role only — revoke authenticated/anon/PUBLIC.
-- An in-body _auth_user_has_permission check is NOT usable here: the service-role
-- call has no user JWT (auth.uid() is null), so it would block the legitimate
-- route. No client-side (authenticated) code calls these RPCs (verified by grep).
REVOKE EXECUTE ON FUNCTION public.replace_user_custom_roles_v2(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_user_custom_roles(uuid, uuid[])  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_user_custom_roles_v2(uuid, jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.replace_user_custom_roles(uuid, uuid[])  TO service_role;

NOTIFY pgrst, 'reload schema';
