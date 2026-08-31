-- 20261032000000_batchE_m3_profitability_scope.sql  (audit M3 — division scope)
--
-- M3 (scope): rpc_product_profitability and rpc_profitability_drilldown never call
-- is_division_visible, so a division-restricted user sees COMPANY-WIDE revenue/COGS
-- (every other report scopes to the caller's visible divisions). Add the visibility
-- filter to each cogs_entries scan. (The currency half of M3 — revenue not converted
-- by so.exchange_rate — is latent while all sales are QAR and is left for later.)

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  -- rpc_product_profitability: current + prev windows
  SELECT pg_get_functiondef('public.rpc_product_profitability(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_product_profitability not found'; END IF;
  IF v_def ~ 'is_division_visible' THEN
    RAISE NOTICE 'M3 product_profitability already scoped — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(where ce\.date >= p_start_date\s+and ce\.date <= p_end_date)',
      '\1' || E'\n      and public.is_division_visible(ce.division_id)', 'g');
    v_new := regexp_replace(v_new,
      '(where ce\.date >= v_prev_start\s+and ce\.date <= v_prev_end)',
      '\1' || E'\n      and public.is_division_visible(ce.division_id)', 'g');
    IF (SELECT count(*) FROM regexp_matches(v_new, 'is_division_visible', 'g')) <> 2 THEN
      RAISE EXCEPTION 'M3 product_profitability: expected 2 scope inserts';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3: rpc_product_profitability division-scoped';
  END IF;

  -- rpc_profitability_drilldown: single window
  SELECT pg_get_functiondef('public.rpc_profitability_drilldown(date,date)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_profitability_drilldown not found'; END IF;
  IF v_def ~ 'is_division_visible' THEN
    RAISE NOTICE 'M3 drilldown already scoped — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(WHERE ce\.date >= p_start_date\s+AND ce\.date <= p_end_date\s+AND ce\.sale_order_id IS NOT NULL)',
      '\1' || E'\n        AND public.is_division_visible(ce.division_id)', 'g');
    IF v_new !~ 'is_division_visible' THEN RAISE EXCEPTION 'M3 drilldown: edit did not land'; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3: rpc_profitability_drilldown division-scoped';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
