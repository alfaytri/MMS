-- Phase 6 of drop-compat-views: final. Drop the three passthrough views.
--
-- Pre-flight: fail loud if any public function still references an old name.
-- If this fails, the migration is rolled back and the views stay in place.
BEGIN;

DO $preflight$
DECLARE
  v_row  RECORD;
  v_hits int := 0;
BEGIN
  FOR v_row IN
    SELECT p.proname,
           CASE
             WHEN p.prosrc ~ '\mprofiles\M'                  THEN 'profiles'
             WHEN p.prosrc ~ '\mreturns\M'                   THEN 'returns'
             WHEN p.prosrc ~ '\minventory_brand_variants\M'  THEN 'inventory_brand_variants'
           END AS view_name
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  (
        p.prosrc ~ '\mprofiles\M'
        OR p.prosrc ~ '\mreturns\M'
        OR p.prosrc ~ '\minventory_brand_variants\M'
      )
  LOOP
    RAISE NOTICE 'Still references %: %', v_row.view_name, v_row.proname;
    v_hits := v_hits + 1;
  END LOOP;
  IF v_hits > 0 THEN
    RAISE EXCEPTION 'Pre-flight failed — % function(s) still reference a compat view', v_hits;
  END IF;
END
$preflight$;

DROP VIEW IF EXISTS public.profiles;
DROP VIEW IF EXISTS public.returns;
DROP VIEW IF EXISTS public.inventory_brand_variants;

NOTIFY pgrst, 'reload schema';

COMMIT;
