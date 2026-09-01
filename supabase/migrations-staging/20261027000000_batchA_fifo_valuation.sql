-- 20261027000000_batchA_fifo_valuation.sql  (audit Batch A: H1, H4)
--
-- H1 (HIGH): _return_line_fifo_unit_cost values a returned/written-off line
-- cheapest-first (ORDER BY date, unit_cost, id) while the COGS reversal drains
-- true FIFO (date, id). On a mixed-cost delivery the scrap debit ≠ the COGS
-- credit, so a reclassification permanently mis-states expense. Drop the
-- unit_cost tie-break — the same fix M2 applied to the reversal side.
--
-- H4 (HIGH): cancel_transfer / reject_transfer_v2 return an in-transit dispatch
-- to stock at ONE arbitrary layer cost (LIMIT 1, no ORDER BY), so value is
-- created/destroyed whenever the dispatch spanned multiple cost layers. Fix:
-- price the returned layer at the VALUE-WEIGHTED AVERAGE of the transfer_out
-- movements, which conserves total drained value exactly (Σqty·cost).
--
-- Drift-proof in-place transforms; assert or abort; idempotent.

DO $do$
DECLARE v_def text; v_new text; r record;
BEGIN
  -- ===== H1: return-line valuation ordering =====
  SELECT pg_get_functiondef('public._return_line_fifo_unit_cost(uuid,uuid,numeric)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION '_return_line_fifo_unit_cost not found'; END IF;
  v_new := regexp_replace(v_def, 'date\s+asc\s*,\s*unit_cost\s+asc\s*,\s*id\s+asc', 'date asc, id asc', 'gi');
  IF v_new IS DISTINCT FROM v_def THEN
    EXECUTE v_new;
    RAISE NOTICE 'A-H1: _return_line_fifo_unit_cost now values in FIFO (date,id) order';
  ELSE
    RAISE NOTICE 'A-H1: no cheapest-first tie-break found (already fixed?) — skip';
  END IF;

  -- ===== H4: transfer cancel/reject weighted-average restore =====
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('cancel_transfer','reject_transfer_v2')
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF v_def ~ 'SUM\(ABS\(qty\) \* ABS\(unit_cost\)\)' THEN
      RAISE NOTICE 'A-H4 % already weighted-avg — skip', r.proname; CONTINUE;
    END IF;
    v_new := regexp_replace(v_def,
      'SELECT ABS\(unit_cost\) INTO v_avg_cost',
      'SELECT SUM(ABS(qty) * ABS(unit_cost)) / NULLIF(SUM(ABS(qty)), 0) INTO v_avg_cost', 'g');
    v_new := regexp_replace(v_new,
      '(movement_type = ''transfer_out'')\s+LIMIT 1;',
      '\1;', 'g');
    IF v_new !~ 'SUM\(ABS\(qty\) \* ABS\(unit_cost\)\)'
       OR v_new ~ 'movement_type = ''transfer_out''\s+LIMIT 1' THEN
      RAISE EXCEPTION 'A-H4 %: edits did not land — aborting', r.proname;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'A-H4 %: in-transit restore now conserves total value (weighted avg)', r.proname;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
