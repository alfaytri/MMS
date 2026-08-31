-- 20261029000000_batchF_m1_stock_level_restore.sql  (audit M1)
--
-- M1 (MED): the forward sale/consumption path decrements the global counter
-- inventory_item_brand_variants.stock_level (via deduct_fifo_layers), but the
-- return-restock functions rebuild the FIFO layer, cogs and movement WITHOUT
-- adding the quantity back to stock_level. So stock_level drifts permanently low
-- by every restocked unit, under-stating the global (no-division) dead-stock
-- valuation (stock_level × average_cost) and any availability check that reads it.
--
-- On success each line fully restocks v_line.qty (the loop RAISEs and rolls back
-- otherwise), so restore exactly that. Applied to both restock functions.

DO $do$
DECLARE v_def text; v_new text; r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('rpc_process_return_restock','rpc_process_consumption_return_restock')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF v_def ~ 'stock_level = stock_level \+ v_line\.qty' THEN
      RAISE NOTICE 'M1 % already restores stock_level — skip', r.proname; CONTINUE;
    END IF;
    v_new := regexp_replace(v_def,
      '(IF v_qty_remaining > 0 THEN\s+RAISE EXCEPTION[^;]*;\s+END IF;)(\s+END LOOP;)',
      '\1' || E'\n\n    UPDATE public.inventory_item_brand_variants\n       SET stock_level = stock_level + v_line.qty, updated_at = now()\n     WHERE id = v_line.brand_variant_id;' || '\2',
      'g');
    IF v_new !~ 'stock_level = stock_level \+ v_line\.qty' THEN
      RAISE EXCEPTION 'M1 %: edit did not land — aborting', r.proname;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M1 %: now restores stock_level on restock', r.proname;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
