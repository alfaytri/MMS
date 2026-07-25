-- Diagnostic-only: RAISE NOTICE the trigger binding counts for the 5 inventory
-- trigger functions rewritten in Phase 3. Any zero-count row = detached trigger.
BEGIN;

DO $$
DECLARE
  v_row RECORD;
  v_total int := 0;
BEGIN
  FOR v_row IN
    SELECT p.proname, COUNT(*) AS n
    FROM   pg_proc p
    LEFT JOIN pg_trigger t ON t.tgfoid = p.oid AND NOT t.tgisinternal
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname IN (
        'fn_refresh_incoming_qty', 'fn_refresh_reserved_qty',
        'recalc_average_cost', 'update_reserved_qty',
        'fn_update_linked_services_count'
      )
    GROUP BY p.proname
    ORDER BY p.proname
  LOOP
    RAISE NOTICE 'trigger func % has % binding(s)', v_row.proname, v_row.n;
    v_total := v_total + v_row.n;
  END LOOP;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'All trigger bindings dropped — Phase 3 rewrite detached them';
  END IF;
END $$;

COMMIT;
