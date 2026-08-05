-- Supabase Auth runs custom access token hooks as the `supabase_auth_admin`
-- role. Without an explicit EXECUTE grant on our hook function, the hook call
-- fails with: "Error running hook URI: pg-functions://postgres/public/custom_access_token_hook".
--
-- The function itself is SECURITY DEFINER (owner: postgres) so it can read
-- user_data / user_custom_roles / custom_roles / user_company_divisions
-- regardless of RLS. We only need to let the auth admin invoke it, and lock
-- it away from anon/authenticated so app code never calls it directly.

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
