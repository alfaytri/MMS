-- Re-lock anon-executable public functions (linter WARN 0028 regression).
--
-- Background: 20260805230000 revoked EXECUTE from PUBLIC/anon on every public
-- function AND set `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ... FROM PUBLIC`
-- so future functions would not silently get PUBLIC execute. The default-privilege
-- part did NOT take effect for functions created by later migrations (default
-- privileges are scoped to the granting role; the plain ALTER only covered objects
-- created by the exact role/context that ran it). Result: functions created after
-- 2026-08-05 (e.g. the VWh project/milestone/report RPCs, payment edit/delete RPCs,
-- several guard triggers) re-acquired the default PUBLIC EXECUTE grant — a live
-- catalog query on 2026-08-30 found 38 such functions. Most are body-guarded
-- (fail-closed for anon) or are trigger/helper functions (trigger firing + RLS +
-- PERFORM do NOT check EXECUTE), so this is defense-in-depth, but it violates the
-- project's no-anon-execute invariant.
--
-- Fix (scoped + idempotent):
--   1. For every public function that CURRENTLY has a PUBLIC EXECUTE grant
--      (proacl NULL = default PUBLIC, or an explicit `=X` PUBLIC entry), REVOKE
--      EXECUTE FROM PUBLIC, anon and GRANT EXECUTE TO authenticated, service_role.
--      Scoped to already-exposed functions so this does NOT touch anything already
--      correctly locked — in particular it leaves `custom_access_token_hook`
--      (granted to supabase_auth_admin, no PUBLIC grant) completely untouched.
--   2. Re-issue the default-privilege revoke, this time explicitly FOR ROLE postgres
--      (the confirmed owner + migration role) so it actually covers future
--      migration-created functions. NOTE: the reliable guard going forward is an
--      explicit `REVOKE EXECUTE ... FROM PUBLIC` in each new DEFINER-function
--      migration (as the money-path RPCs already do) — this ALTER is a backstop.
--
-- Trigger firing does NOT check EXECUTE on the trigger function, and cross-function
-- (PERFORM) calls run in the outer definer context, so revoking PUBLIC never breaks
-- triggers or internal helpers (per the 20260805230000 rationale, live-proven).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proacl IS NULL
        OR EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        )
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

-- Default-privilege backstop (explicit FOR ROLE postgres = the function owner +
-- migration role confirmed live). KEPT for completeness, but a live test on
-- 2026-08-30 (create a throwaway postgres-owned function AFTER this ALTER → it
-- STILL received the PUBLIC EXECUTE grant) proves ALTER DEFAULT PRIVILEGES does
-- NOT reliably suppress the PUBLIC grant in this Supabase environment — same root
-- cause that made 20260805230000's version ineffective. => The ONLY reliable guard
-- is an explicit `REVOKE EXECUTE ON FUNCTION <sig> FROM PUBLIC` in EVERY new
-- DEFINER-function migration (as the money-path + VWh RPCs now do). Do not rely on
-- this ALTER; it is harmless but insufficient on its own.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
