-- Final verify: actually call the fixed function and report shape.
do $$
declare
  v_result jsonb;
begin
  v_result := public.rpc_product_profitability(
    (current_date - interval '30 days')::date,
    current_date
  );
  raise notice 'RPC OK: products=% summary=%',
    jsonb_array_length(v_result->'products'),
    v_result->'summary';
end $$;

notify pgrst, 'reload schema';
