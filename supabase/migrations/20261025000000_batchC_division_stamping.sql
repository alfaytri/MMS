-- 20261025000000_batchC_division_stamping.sql  (audit Batch C: H6 + L7)
--
-- H6 (HIGH): rpc_return_damaged_from_repair books the 'return_from_repair_as_writeoff'
-- loss into inventory_damaged_movements with NO division_id. rpc_report_pnl's Scrap
-- block filters `division_id = ANY(p_division_ids)`, and NULL = ANY(...) is NULL, so
-- the write-off is dropped from every per-division P&L (weakening the #2 fix that
-- taught P&L to count this loss type). Resolve division from the sub-container the
-- stock returns to (v_to_sub_container_id) and stamp it, matching every other scrap
-- producer. Drift-proof in-place transform; asserts or aborts.
--
-- L7 (LOW): backfill the historical sale COGS rows still missing division_id
-- (they predate the division-stamping trigger) so per-division P&L reconciles.

-- ---- H6: stamp division on the repair write-off movement --------------------
DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_return_damaged_from_repair(uuid,text,numeric,numeric,numeric,text)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_return_damaged_from_repair not found'; END IF;

  IF v_def ~ 'division_id' THEN
    RAISE NOTICE 'C-H6 already stamps division_id — skip';
  ELSE
    -- add division_id to the inventory_damaged_movements column list
    v_new := regexp_replace(v_def,
      '(source_return_line_disposition_id, source_transfer_id, notes, created_by)(\s*\)\s*values)',
      '\1, division_id\2', 'g');
    -- ...and the matching value: division of the sub-container the stock returns to
    v_new := regexp_replace(v_new,
      '(''return_from_repair_as_writeoff'', p_qty_writeoff[^;]*?v_uid)(\s*\))',
      '\1, (select division_id from public.warehouse_sub_containers where id = v_to_sub_container_id)\2', 'g');

    IF v_new !~ 'created_by, division_id'
       OR v_new !~ 'select division_id from public\.warehouse_sub_containers where id = v_to_sub_container_id' THEN
      RAISE EXCEPTION 'C-H6: edits did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'C-H6: repair write-off now carries division_id';
  END IF;
END
$do$;

-- ---- L7: backfill historical sale COGS division_id --------------------------
-- Resolve from the variant's representative in-stock/receival layer sub-container
-- division (the same way allocate_landed_cost resolves a sold-units division).
-- Only touches source_type='sale' rows that are still NULL and are resolvable.
WITH resolved AS (
  SELECT ce.id,
         (SELECT wsc.division_id
            FROM public.fifo_cost_layers f
            JOIN public.warehouse_sub_containers wsc ON wsc.id = f.sub_container_id
           WHERE f.brand_variant_id = ce.brand_variant_id
             AND wsc.division_id IS NOT NULL
           ORDER BY f.qty DESC NULLS LAST
           LIMIT 1) AS div
    FROM public.cogs_entries ce
   WHERE ce.source_type = 'sale' AND ce.division_id IS NULL
)
UPDATE public.cogs_entries ce
   SET division_id = r.div
  FROM resolved r
 WHERE ce.id = r.id AND r.div IS NOT NULL;

NOTIFY pgrst, 'reload schema';
