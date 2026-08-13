-- Fix Supabase database-linter WARN 0028 (anon_security_definer_function_executable).
--
-- Before this migration, the anon role could POST /rest/v1/rpc/<any_public_fn>
-- and execute it — every business RPC in the database was reachable
-- unauthenticated. Most functions are SECURITY DEFINER, so RLS on the
-- underlying tables did not protect them either; the only guardrail was
-- whatever `_user_has_permission()` check each function's body carried,
-- and many functions have none.
--
-- Fix: revoke EXECUTE from PUBLIC (which includes anon) on every public
-- function, then re-grant to authenticated + service_role only. This
-- keeps signed-in employees and server-side callers working while cutting
-- off unauthenticated access.
--
-- Safe for trigger functions: trigger firing does NOT check EXECUTE
-- privilege on the trigger's function, only DML privilege on the table.
-- Safe for cross-function calls (PERFORM other_fn) inside SECURITY DEFINER
-- functions: those run in the outer function's definer context, not the
-- caller's.
--
-- Idempotent — can be re-run.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;',
      r.proname, r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;',
      r.proname, r.args
    );
  END LOOP;
END $$;

-- Belt and suspenders: also flip default privileges on the public schema
-- so any NEW function created in future migrations does not silently
-- grant EXECUTE to PUBLIC. Future migrations should still be explicit
-- about GRANT to authenticated / service_role, but this catches
-- accidents.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
