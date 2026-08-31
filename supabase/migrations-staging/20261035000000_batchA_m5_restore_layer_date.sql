-- 20261035000000_batchA_m5_restore_layer_date.sql  (audit M5 — date part)
--
-- M5: the return/consumption restock functions rebuild the FIFO layer dated
-- current_date, so restored stock jumps to the NEWEST slot in the FIFO queue and a
-- later sale can draw cost from the wrong layer (a timing/classification wrinkle,
-- self-reversing over the item's life — no permanent total error). The restock loop
-- already reads the cogs row's date (= the original sale date); use it so the
-- restored layer sorts at roughly its original position (matching how
-- cancel_delivery_inventory already uses the delivery date).
--
-- The landed_cost_per_unit=0 flattening is left as-is: total cost stays correct
-- (unit_cost carries the full amount); only a report that splits landed cost out
-- would show 0 for restored stock, and recovering the split needs the source
-- layer, which the restock loop does not carry.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  -- rpc_process_return_restock
  SELECT pg_get_functiondef('public.rpc_process_return_restock(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND v_def !~ 'v_line_warehouse,\s+v_cogs\.date' THEN
    v_new := regexp_replace(v_def, '(v_line_warehouse,\s+)current_date,', '\1v_cogs.date,', 'g');
    IF v_new !~ 'v_line_warehouse,\s+v_cogs\.date' THEN RAISE EXCEPTION 'M5 return_restock: edit did not land'; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M5: return-restock layer dated at the original sale date';
  END IF;

  -- rpc_process_consumption_return_restock
  SELECT pg_get_functiondef('public.rpc_process_consumption_return_restock(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND v_def !~ 'v_warehouse, v_cogs\.date' THEN
    v_new := regexp_replace(v_def, '(v_warehouse, )current_date,', '\1v_cogs.date,', 'g');
    IF v_new !~ 'v_warehouse, v_cogs\.date' THEN RAISE EXCEPTION 'M5 consumption_restock: edit did not land'; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M5: consumption-restock layer dated at the original sale date';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
