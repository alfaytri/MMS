-- 20261036000000_batchE_m3_currency.sql  (audit M3 — currency conversion)
--
-- M3 (currency): rpc_product_profitability and rpc_profitability_drilldown compute
-- revenue as qty * unit_price WITHOUT converting to QAR, while COGS (ce.total_cost)
-- is already QAR. Every other revenue calc (rpc_report_pnl, rpc_report_revenue_cogs)
-- multiplies by so.exchange_rate. Add a sale_orders join and the * exchange_rate
-- factor so revenue/profit are QAR. No-op for QAR orders (rate 1); correct for
-- foreign-currency sales. (Displayed per-unit price stays in the order's currency.)
--
-- Drift-proof in-place transforms; assert or abort; idempotent.

DO $do$
DECLARE v_def text; v_new text; v_cnt int;
BEGIN
  -- rpc_product_profitability (lowercase sql)
  SELECT pg_get_functiondef('public.rpc_product_profitability(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_product_profitability not found'; END IF;
  IF v_def ~ 'so_fx\.exchange_rate' THEN
    RAISE NOTICE 'M3-fx product_profitability already converts — skip';
  ELSE
    -- add sale_orders join after each sale_order_lines join (both windows)
    v_new := regexp_replace(v_def,
      '(join sale_order_lines sol\s+on sol\.sale_order_id  = ce\.sale_order_id\s+and sol\.brand_variant_id = ce\.brand_variant_id)',
      '\1' || E'\n    join sale_orders so_fx on so_fx.id = ce.sale_order_id', 'g');
    -- multiply revenue by exchange_rate (both windows)
    v_new := regexp_replace(v_new,
      'sum\(ce\.qty \* sol\.unit_price\)',
      'sum(ce.qty * sol.unit_price * coalesce(so_fx.exchange_rate, 1))', 'g');
    v_cnt := (SELECT count(*) FROM regexp_matches(v_new, 'so_fx\.exchange_rate', 'g'));
    IF v_new !~ 'join sale_orders so_fx' OR v_cnt <> 2 THEN  -- 2 joins + 2 revenue multipliers
      RAISE EXCEPTION 'M3-fx product_profitability: join present=% exchange_rate refs=% (want join + 2)', (v_new ~ 'join sale_orders so_fx'), v_cnt;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3-fx: rpc_product_profitability revenue now QAR';
  END IF;

  -- rpc_profitability_drilldown (uppercase SQL)
  SELECT pg_get_functiondef('public.rpc_profitability_drilldown(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_profitability_drilldown not found'; END IF;
  IF v_def ~ 'so_fx\.exchange_rate' THEN
    RAISE NOTICE 'M3-fx drilldown already converts — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(JOIN sale_order_lines sol\s+ON sol\.sale_order_id  = ce\.sale_order_id\s+AND sol\.brand_variant_id = ce\.brand_variant_id)',
      '\1' || E'\n      JOIN sale_orders so_fx ON so_fx.id = ce.sale_order_id', 'g');
    v_new := regexp_replace(v_new,
      'SUM\(ce\.qty \* sol\.unit_price\)',
      'SUM(ce.qty * sol.unit_price * COALESCE(so_fx.exchange_rate, 1))', 'g');
    v_cnt := (SELECT count(*) FROM regexp_matches(v_new, 'so_fx\.exchange_rate', 'g'));
    IF v_new !~ 'JOIN sale_orders so_fx' OR v_cnt <> 2 THEN  -- 1 join + 2 revenue multipliers (line_revenue + line_profit)
      RAISE EXCEPTION 'M3-fx drilldown: join present=% exchange_rate refs=% (want join + 2)', (v_new ~ 'JOIN sale_orders so_fx'), v_cnt;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3-fx: rpc_profitability_drilldown revenue now QAR';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
