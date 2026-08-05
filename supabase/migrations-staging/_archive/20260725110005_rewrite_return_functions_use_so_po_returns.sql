-- Phase 4 of drop-compat-views: rewrite 7 return-workflow RPCs to reference
-- `so_po_returns` directly instead of the compat view `returns`.
--
-- Case-sensitive word-boundary regex: matches lowercase `returns` (table name)
-- but not uppercase `RETURNS` (SQL keyword in function signatures).
BEGIN;

DO $rewrite$
DECLARE
  v_target text;
  v_oid    oid;
  v_def    text;
  v_new    text;
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
    FOR v_oid IN
      SELECT p.oid
      FROM   pg_proc p
      JOIN   pg_namespace n ON n.oid = p.pronamespace
      WHERE  n.nspname = 'public'
        AND  p.proname = v_target
    LOOP
      v_def := pg_get_functiondef(v_oid);
      -- Case-sensitive: only lowercase `returns` (table refs) get rewritten.
      v_new := regexp_replace(v_def, '\mreturns\M', 'so_po_returns', 'g');
      IF v_new IS DISTINCT FROM v_def THEN
        EXECUTE v_new;
        RAISE NOTICE 'Rewrote %', v_target;
      ELSE
        RAISE NOTICE 'No change needed for % (no old ref)', v_target;
      END IF;
    END LOOP;
  END LOOP;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
