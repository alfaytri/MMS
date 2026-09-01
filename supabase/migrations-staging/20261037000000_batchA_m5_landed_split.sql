-- 20261037000000_batchA_m5_landed_split.sql  (audit M5 — landed split)
--
-- M5 (landed): the restore functions rebuild a FIFO layer with
-- landed_cost_per_unit = 0 and total_unit_cost = the full drained cost, so the
-- base/landed split is lost on restored stock. Total cost stays correct, but the
-- FIFO-layers table and warehouse stock-value view (which display landed cost per
-- unit) show 0 landed for that stock. Recover the split from the source layer via
-- the cogs row's source_id: landed = source layer's landed_cost_per_unit, base =
-- total - landed. Falls back to 0 (all base) when source_id is null / purged.
--
-- Drift-proof in-place transforms; assert or abort; idempotent (marker = the
-- landed lookup, which none of the three functions contained before this fix).

DO $do$
DECLARE
  v_def text; v_new text;
  c_landed constant text := 'COALESCE((SELECT landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs.source_id), 0)';
  c_marker constant text := 'landed_cost_per_unit FROM public.fifo_cost_layers WHERE id = v_cogs\.source_id';
BEGIN
  -- rpc_process_return_restock: add source_id to the v_cogs loop, then split
  SELECT pg_get_functiondef('public.rpc_process_return_restock(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND v_def !~ c_marker THEN
    v_new := regexp_replace(v_def,
      '(SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date)(\s+FROM\s+cogs_entries)',
      '\1, source_id\2', 'g');
    v_new := regexp_replace(v_new,
      'v_cogs\.unit_cost,(\s+)0,(\s+)v_cogs\.unit_cost,',
      'v_cogs.unit_cost - ' || c_landed || ',\1' || c_landed || ',\2v_cogs.unit_cost,', 'g');
    IF v_new !~ c_marker OR v_new !~ ', source_id\s+FROM\s+cogs_entries' THEN
      RAISE EXCEPTION 'M5-landed return_restock: edits did not land';
    END IF;
    EXECUTE v_new; RAISE NOTICE 'M5-landed: return_restock preserves landed split';
  END IF;

  -- rpc_process_consumption_return_restock
  SELECT pg_get_functiondef('public.rpc_process_consumption_return_restock(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND v_def !~ c_marker THEN
    v_new := regexp_replace(v_def,
      '(consumer_type, consumer_sub_container_id, consumer_customer_id, date)(\s+FROM\s+public\.cogs_entries)',
      '\1, source_id\2', 'g');
    v_new := regexp_replace(v_new,
      'v_cogs\.unit_cost,(\s+)0,(\s+)v_cogs\.unit_cost,',
      'v_cogs.unit_cost - ' || c_landed || ',\1' || c_landed || ',\2v_cogs.unit_cost,', 'g');
    IF v_new !~ c_marker OR v_new !~ 'consumer_customer_id, date, source_id' THEN
      RAISE EXCEPTION 'M5-landed consumption_restock: edits did not land';
    END IF;
    EXECUTE v_new; RAISE NOTICE 'M5-landed: consumption_restock preserves landed split';
  END IF;

  -- cancel_delivery_inventory (its v_cogs loop already selects source_id)
  SELECT pg_get_functiondef('public.cancel_delivery_inventory'::regproc) INTO v_def;
  IF v_def IS NOT NULL AND v_def !~ c_marker THEN
    v_new := regexp_replace(v_def,
      'v_cogs\.unit_cost,(\s+)0,(\s+)v_cogs\.unit_cost,',
      'v_cogs.unit_cost - ' || c_landed || ',\1' || c_landed || ',\2v_cogs.unit_cost,', 'g');
    IF v_new !~ c_marker THEN
      RAISE EXCEPTION 'M5-landed cancel_delivery: edit did not land';
    END IF;
    EXECUTE v_new; RAISE NOTICE 'M5-landed: cancel_delivery preserves landed split';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
