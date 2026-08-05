-- Phase 5 verification.
BEGIN;

DO $$
DECLARE
  v_target text;
  v_count  int;
  v_targets text[] := ARRAY[
    'has_admin_permission',
    'bootstrap_first_user',
    'check_is_division_manager',
    'submit_credit_group_change'
  ];
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_target;
    RAISE NOTICE '% : % overload(s) present', v_target, v_count;
  END LOOP;

  -- Also: any remaining profiles refs in ANY public function body?
  -- Use prosrc (raw stored source) not pg_get_functiondef to avoid choking on
  -- functions whose bodies reference aggregates in expand-unsafe positions.
  RAISE NOTICE '---';
  FOR v_target IN
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~ '\mprofiles\M'
    ORDER BY p.proname
  LOOP
    RAISE NOTICE 'Still references profiles: %', v_target;
  END LOOP;
END $$;

COMMIT;
