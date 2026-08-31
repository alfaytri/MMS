-- 20261028000000_audit_quick_fixes.sql  (audit: L1, H2, L5, L6)
--
-- L1: rpc_report_pnl_cogs_detail excluded 'sale_replacement' from its COGS set,
--     so the drill-down under-reports vs the headline P&L (which counts it).
-- H2: cancel_delivery_inventory / rpc_cancel_consumption restored FIFO layers from
--     cogs_entries with no `qty > 0` filter, so a cancel after a return re-processed
--     the return's NEGATIVE rows → remaining_qty = -N layers overstating inventory.
--     Filter to qty > 0 (restore only the original outbound cost rows).
-- L5/L6: remove two dead functions — approve_receival_inventory (no callers, would
--     book PO-currency layers) and apply_adjustment (references a dropped table).

DO $do$
DECLARE v_def text; v_new text; v_oid oid;
BEGIN
  -- L1
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_report_pnl_cogs_detail';
  IF v_oid IS NOT NULL THEN
    v_def := pg_get_functiondef(v_oid);
    IF v_def !~ 'sale_replacement' THEN
      v_new := regexp_replace(v_def, '(IN \(''sale'', ''sale_return'',)( ''consumption'')', '\1 ''sale_replacement'',\2', 'g');
      IF v_new !~ 'sale_replacement' THEN RAISE EXCEPTION 'L1: edit did not land'; END IF;
      EXECUTE v_new; RAISE NOTICE 'L1: pnl_cogs_detail now includes sale_replacement';
    END IF;
  END IF;

  -- H2 cancel_delivery_inventory
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='cancel_delivery_inventory';
  IF v_oid IS NOT NULL THEN
    v_def := pg_get_functiondef(v_oid);
    IF v_def !~ 'sale_delivery_id = p_delivery_id AND qty > 0' THEN
      v_new := regexp_replace(v_def,
        '(SELECT brand_variant_id, qty, unit_cost, source_id\s+FROM\s+cogs_entries\s+WHERE\s+sale_delivery_id = p_delivery_id)(\s+LOOP)',
        '\1 AND qty > 0\2', 'g');
      IF v_new !~ 'sale_delivery_id = p_delivery_id AND qty > 0' THEN RAISE EXCEPTION 'H2 cancel_delivery: edit did not land'; END IF;
      EXECUTE v_new; RAISE NOTICE 'H2: cancel_delivery_inventory restore skips negative cogs';
    END IF;
  END IF;

  -- H2 rpc_cancel_consumption
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_cancel_consumption';
  IF v_oid IS NOT NULL THEN
    v_def := pg_get_functiondef(v_oid);
    IF v_def !~ 'consumption_id = p_consumption_id AND qty > 0' THEN
      v_new := regexp_replace(v_def,
        '(SELECT brand_variant_id, qty, unit_cost, source_id\s+FROM\s+public\.cogs_entries\s+WHERE\s+consumption_id = p_consumption_id)(\s+LOOP)',
        '\1 AND qty > 0\2', 'g');
      IF v_new !~ 'consumption_id = p_consumption_id AND qty > 0' THEN RAISE EXCEPTION 'H2 cancel_consumption: edit did not land'; END IF;
      EXECUTE v_new; RAISE NOTICE 'H2: rpc_cancel_consumption restore skips negative cogs';
    END IF;
  END IF;
END
$do$;

-- L5 / L6: drop dead functions (no CASCADE — fails loudly if anything depends on them)
DROP FUNCTION IF EXISTS public.approve_receival_inventory(uuid, text);
DROP FUNCTION IF EXISTS public.apply_adjustment(uuid);

NOTIFY pgrst, 'reload schema';
