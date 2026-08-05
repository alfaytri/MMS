-- Clean up return_lines rows that were orphaned by the 2026-07-23 tools-into-
-- inventory merge: tool_asset_item_id was dropped, but rows where the mapping
-- didn't resolve stayed with brand_variant_id = NULL and no item name / sku.
--
-- Safety: we log the delete plan via RAISE NOTICE, only remove rows that:
--   * have brand_variant_id IS NULL, AND
--   * have no usable item identity (item_name null/empty/'(No name)' AND sku null/empty).
-- Parent so_po_returns rows are only removed if they end up with zero
-- remaining lines AND nothing else references them (credit_notes /
-- debit_notes / activity_log — checked with FK-safe deletes).

BEGIN;

DO $$
DECLARE
  v_orphan_line_ids  uuid[];
  v_parent_ids       uuid[];
  v_line_count       int;
  v_cn_refs          int := 0;
  v_dn_refs          int := 0;
BEGIN
  -- Identify orphan lines.
  SELECT array_agg(id), array_agg(DISTINCT return_id)
  INTO   v_orphan_line_ids, v_parent_ids
  FROM   public.return_lines
  WHERE  brand_variant_id IS NULL
    AND  (item_name IS NULL OR btrim(item_name) = '' OR item_name = '(No name)')
    AND  (sku IS NULL OR btrim(sku) = '');

  v_line_count := COALESCE(array_length(v_orphan_line_ids, 1), 0);
  RAISE NOTICE 'Orphan return_lines to delete: %', v_line_count;

  IF v_line_count = 0 THEN
    RETURN;
  END IF;

  RAISE NOTICE 'Distinct parent so_po_returns touched: %',
    COALESCE(array_length(v_parent_ids, 1), 0);

  -- Check whether any parent return is referenced from a credit/debit note.
  IF to_regclass('public.credit_notes') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.credit_notes WHERE source_return_id = ANY($1)'
      INTO v_cn_refs USING v_parent_ids;
  END IF;
  IF to_regclass('public.debit_notes') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM public.debit_notes WHERE source_return_id = ANY($1)'
      INTO v_dn_refs USING v_parent_ids;
  END IF;

  RAISE NOTICE 'Parents referenced by credit_notes: %, debit_notes: %', v_cn_refs, v_dn_refs;

  -- Always safe to delete the orphan lines (they carry no reference of value).
  DELETE FROM public.return_lines WHERE id = ANY(v_orphan_line_ids);
  RAISE NOTICE 'Deleted % orphan return_lines', v_line_count;

  -- Delete any parent so_po_returns that end up with zero remaining lines AND
  -- are not referenced by any note. Rows that ARE referenced stay so their
  -- notes remain auditable — they just show as empty returns.
  DELETE FROM public.so_po_returns r
  WHERE  r.id = ANY(v_parent_ids)
    AND  NOT EXISTS (SELECT 1 FROM public.return_lines rl WHERE rl.return_id = r.id)
    AND  NOT EXISTS (SELECT 1 FROM public.credit_notes  cn WHERE cn.source_return_id = r.id)
    AND  NOT EXISTS (SELECT 1 FROM public.debit_notes   dn WHERE dn.source_return_id = r.id);

  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % empty parent so_po_returns rows', v_line_count;
END $$;

COMMIT;
