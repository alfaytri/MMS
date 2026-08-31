-- 20261038000000_fix_profitability_revenue_scope.sql
--
-- Bug surfaced during the M3 currency work: rpc_product_profitability /
-- rpc_profitability_drilldown compute revenue as SUM(qty * unit_price) over EVERY
-- cogs_entries row in the window with no source_type filter, so non-sale rows
-- (landed_cost, landed_cost_reversal, consumption) are multiplied by a sale price
-- and pollute "revenue" — on staging the summary revenue came out NEGATIVE.
--
-- Fix: only actual sale rows contribute to revenue — source_type IN
-- ('sale','sale_return') (sale_replacement stays 0-revenue, matching rpc_report_pnl).
-- COGS (SUM(total_cost)) is left summing all cost rows, exactly as the P&L does
-- (landed cost + consumption ARE cost). Idempotent; asserts or aborts.

DO $do$
DECLARE v_def text; v_new text; v_cnt int;
BEGIN
  -- rpc_product_profitability (lowercase)
  SELECT pg_get_functiondef('public.rpc_product_profitability(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_product_profitability not found'; END IF;
  IF v_def ~ 'CASE WHEN ce\.source_type IN' THEN
    RAISE NOTICE 'revenue-scope product_profitability already fixed — skip';
  ELSE
    v_new := regexp_replace(v_def,
      'sum\(ce\.qty \* sol\.unit_price \* coalesce\(so_fx\.exchange_rate, 1\)\)',
      'sum(CASE WHEN ce.source_type IN (''sale'', ''sale_return'') THEN ce.qty * sol.unit_price * coalesce(so_fx.exchange_rate, 1) ELSE 0 END)', 'g');
    v_cnt := (SELECT count(*) FROM regexp_matches(v_new, 'CASE WHEN ce\.source_type IN', 'g'));
    IF v_cnt <> 2 THEN RAISE EXCEPTION 'revenue-scope product_profitability: expected 2 CASE wraps, got %', v_cnt; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'revenue-scope: rpc_product_profitability revenue = sale rows only';
  END IF;

  -- rpc_profitability_drilldown (uppercase)
  SELECT pg_get_functiondef('public.rpc_profitability_drilldown(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_profitability_drilldown not found'; END IF;
  IF v_def ~ 'CASE WHEN ce\.source_type IN' THEN
    RAISE NOTICE 'revenue-scope drilldown already fixed — skip';
  ELSE
    v_new := regexp_replace(v_def,
      'SUM\(ce\.qty \* sol\.unit_price \* COALESCE\(so_fx\.exchange_rate, 1\)\)',
      'SUM(CASE WHEN ce.source_type IN (''sale'', ''sale_return'') THEN ce.qty * sol.unit_price * COALESCE(so_fx.exchange_rate, 1) ELSE 0 END)', 'g');
    v_cnt := (SELECT count(*) FROM regexp_matches(v_new, 'CASE WHEN ce\.source_type IN', 'g'));
    IF v_cnt <> 2 THEN RAISE EXCEPTION 'revenue-scope drilldown: expected 2 CASE wraps, got %', v_cnt; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'revenue-scope: rpc_profitability_drilldown revenue = sale rows only';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
