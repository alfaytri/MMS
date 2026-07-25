-- Phase 4 verification: which of the 7 return RPCs exist in the DB?
BEGIN;

DO $$
DECLARE
  v_target text;
  v_count  int;
  v_targets text[] := ARRAY[
    'dispatch_return',
    'undispatch_return',
    'restock_return',
    'create_return_lines',
    'rpc_cancel_po_return_dispatch',
    'rpc_process_po_return_dispatch',
    'rpc_process_return_restock'
  ];
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_target;
    RAISE NOTICE '% : % overload(s) found', v_target, v_count;
  END LOOP;
END $$;

COMMIT;
