-- Phase 5 of drop-compat-views: rewrite the 4 delicate RLS/auth functions
-- to reference `user_data` directly instead of the `profiles` compat view.
--
-- Functions:
--   - has_admin_permission            (called by ~every RLS policy — must not drift)
--   - bootstrap_first_user            (trigger on auth.users — first-login gate)
--   - check_is_division_manager
--   - submit_credit_group_change
--
-- Strategy:
--   1. Snapshot each function's prosecdef + prorettype + proargtypes BEFORE.
--   2. Rewrite via pg_get_functiondef + two regexp_replace passes:
--        - profiles       → user_data          (compat view drop, Phase 5 goal)
--        - is_system      → is_system_admin    (custom_roles column rename in
--          20260724160000 was never propagated to has_admin_permission — the
--          function is LANGUAGE sql, so it wouldn't re-validate until the
--          next CREATE OR REPLACE, i.e. right now).
--   3. Snapshot AFTER and RAISE EXCEPTION on any mismatch.
BEGIN;

DO $rewrite$
DECLARE
  v_target  text;
  v_oid     oid;
  v_def     text;
  v_new     text;
  v_before  RECORD;
  v_after   RECORD;
  v_targets text[] := ARRAY[
    'has_admin_permission',
    'bootstrap_first_user',
    'check_is_division_manager',
    'submit_credit_group_change'
  ];
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    FOR v_oid IN
      SELECT p.oid
      FROM   pg_proc p
      JOIN   pg_namespace n ON n.oid = p.pronamespace
      WHERE  n.nspname = 'public'
        AND  p.proname = v_target
    LOOP
      -- BEFORE snapshot
      SELECT prosecdef, prorettype::regtype::text AS rettype,
             array_to_string(proargtypes::regtype[]::text[], ',') AS args
      INTO   v_before
      FROM   pg_proc WHERE oid = v_oid;

      v_def := pg_get_functiondef(v_oid);
      v_new := regexp_replace(v_def, '\mprofiles\M', 'user_data', 'g');
      v_new := regexp_replace(v_new, '\mis_system\M', 'is_system_admin', 'g');
      IF v_new IS NOT DISTINCT FROM v_def THEN
        RAISE NOTICE 'No change for % (no old refs)', v_target;
        CONTINUE;
      END IF;

      EXECUTE v_new;
      RAISE NOTICE 'Rewrote %', v_target;

      -- AFTER snapshot — must match byte-for-byte
      SELECT prosecdef, prorettype::regtype::text AS rettype,
             array_to_string(proargtypes::regtype[]::text[], ',') AS args
      INTO   v_after
      FROM   pg_proc WHERE oid = v_oid;

      IF v_before.prosecdef IS DISTINCT FROM v_after.prosecdef
         OR v_before.rettype IS DISTINCT FROM v_after.rettype
         OR v_before.args    IS DISTINCT FROM v_after.args THEN
        RAISE EXCEPTION
          'Signature drift on % : before (secdef=%, ret=%, args=%) after (secdef=%, ret=%, args=%)',
          v_target,
          v_before.prosecdef, v_before.rettype, v_before.args,
          v_after.prosecdef,  v_after.rettype,  v_after.args;
      END IF;
    END LOOP;
  END LOOP;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
