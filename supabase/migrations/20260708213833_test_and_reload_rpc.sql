-- Neutralized: the RPC-invocation test that lived here previously
-- errored against a broken CTE reference. The fix is in migration
-- 20260708213903_rpc_product_profitability_single_cte.sql.
notify pgrst, 'reload schema';
