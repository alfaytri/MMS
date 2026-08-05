-- Phase 5 cleanup: sweep any remaining public functions that still reference
-- `profiles`. The original plan enumerated 4 delicate functions, but 8 more
-- were found by the verification query in 20260725130001 (services triggers,
-- auth JWT hook, storage RLS helpers, etc.). Rewrite them all so Phase 6 can
-- safely drop the compat view.
BEGIN;

DO $rewrite$
DECLARE
  v_row  RECORD;
  v_def  text;
  v_new  text;
  v_ok   int := 0;
  v_fail int := 0;
BEGIN
  FOR v_row IN
    SELECT p.oid, p.proname
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosrc ~ '\mprofiles\M'
    ORDER BY p.proname
  LOOP
    BEGIN
      v_def := pg_get_functiondef(v_row.oid);
      v_new := regexp_replace(v_def, '\mprofiles\M', 'user_data', 'g');
      -- Two storage RLS helpers also had a latent cr.is_system ref (column
      -- renamed 20260724160000 but LANGUAGE sql defers validation to next
      -- CREATE OR REPLACE — that's now).
      v_new := regexp_replace(v_new, '\mis_system\M', 'is_system_admin', 'g');
      IF v_new IS DISTINCT FROM v_def THEN
        EXECUTE v_new;
        v_ok := v_ok + 1;
        RAISE NOTICE 'OK  %', v_row.proname;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      RAISE NOTICE 'FAIL % — %', v_row.proname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '---';
  RAISE NOTICE 'Rewritten: %, Failed: %', v_ok, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'Some rewrites failed — investigate before dropping the compat view';
  END IF;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
