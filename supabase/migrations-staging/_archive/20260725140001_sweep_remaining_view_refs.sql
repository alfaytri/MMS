-- Sweep all remaining function bodies that reference any of the 3 compat views
-- (profiles, returns, inventory_brand_variants). Pre-flight in the drop
-- migration found 20+ more that the plan's grep missed.
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
      AND  (
        p.prosrc ~ '\mprofiles\M'
        OR p.prosrc ~ '\mreturns\M'
        OR p.prosrc ~ '\minventory_brand_variants\M'
      )
    ORDER BY p.proname
  LOOP
    BEGIN
      v_def := pg_get_functiondef(v_row.oid);
      v_new := v_def;
      v_new := regexp_replace(v_new, '\mprofiles\M',                 'user_data',                     'g');
      v_new := regexp_replace(v_new, '\mreturns\M',                  'so_po_returns',                 'g');
      v_new := regexp_replace(v_new, '\minventory_brand_variants\M', 'inventory_item_brand_variants', 'g');
      -- Latent bugs discovered during Phase 5 sweep:
      v_new := regexp_replace(v_new, '\mis_system\M',                'is_system_admin',               'g');
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
    RAISE EXCEPTION 'Some rewrites failed — see NOTICE lines above';
  END IF;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
