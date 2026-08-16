-- Include internal consumption in the P&L COGS (total + drill-down).
--
-- Operator decision: the Warehouse Stock Value COGS already counts consumption
-- (materials used on jobs), so the P&L should match. rpc_report_pnl (accrual
-- COGS) and rpc_report_pnl_cogs_detail previously scoped it OUT; this adds
-- 'consumption' to their source_type filter. Consumption rows are fully
-- division- + warehouse-scopable (consumer_division_id + source_id populated),
-- so they respect the P&L's division/warehouse filters. Effect: Total COGS rises
-- and gross profit drops by the consumed-materials cost (no matching revenue —
-- internal use, by design).
--
-- Applied as an in-place rewrite: read each live body via pg_get_functiondef and
-- splice 'consumption' into the source_type list, so the long bodies are not
-- re-transcribed (lower transcription risk). Idempotent — a re-run finds the
-- already-5-type list, leaves it, and re-creates identically. Guarded: aborts if
-- the expected filter string isn't present, rather than silently no-op.

DO $$
DECLARE
  v_src  text;
  v_from text := 'ce.source_type IN (''sale'', ''sale_return'', ''landed_cost'', ''landed_cost_reversal'')';
  v_to   text := 'ce.source_type IN (''sale'', ''sale_return'', ''consumption'', ''landed_cost'', ''landed_cost_reversal'')';
BEGIN
  -- rpc_report_pnl — accrual COGS lines
  v_src := pg_get_functiondef('public.rpc_report_pnl(date,date,text,uuid[],uuid[])'::regprocedure);
  v_src := replace(v_src, v_from, v_to);
  IF position('''consumption''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'rpc_report_pnl: expected COGS source_type filter not found — aborting';
  END IF;
  EXECUTE v_src;

  -- rpc_report_pnl_cogs_detail — the "Total COGS" drill-down
  v_src := pg_get_functiondef('public.rpc_report_pnl_cogs_detail(date,date,uuid[],uuid[])'::regprocedure);
  v_src := replace(v_src, v_from, v_to);
  IF position('''consumption''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'rpc_report_pnl_cogs_detail: expected COGS source_type filter not found — aborting';
  END IF;
  EXECUTE v_src;
END $$;

NOTIFY pgrst, 'reload schema';
