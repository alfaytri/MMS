-- Warehouse Model v2 — Phase D.4.a Task 1
-- Add receival_item_id link on return_lines. Backfill existing PO-source rows
-- by FIFO-matching against receival_items at the restock warehouse.

ALTER TABLE public.return_lines
  ADD COLUMN receival_item_id uuid REFERENCES public.receival_items(id);

CREATE INDEX return_lines_receival_item_id_idx
  ON public.return_lines(receival_item_id)
  WHERE receival_item_id IS NOT NULL;

COMMENT ON COLUMN public.return_lines.receival_item_id IS
  'For PO-source returns: which receival_items row this line is returning stock from. Drives sub-container-scoped FIFO drain in rpc_process_po_return_dispatch. NULL for SO-source returns (they have no receival).';

-- Backfill: FIFO-match each existing PO-source return_line against receival_items
-- at its restock warehouse for the same brand_variant. Oldest receival first,
-- respecting remaining qty already claimed by other backfilled rows in this batch.

DO $$
DECLARE
  v_line          RECORD;
  v_candidate     RECORD;
  v_remaining_qty integer;
  v_assigned      boolean;
BEGIN
  FOR v_line IN
    SELECT rl.id, rl.qty, rl.brand_variant_id, r.restock_warehouse_id, r.return_number
    FROM   public.return_lines rl
    JOIN   public.so_po_returns r ON r.id = rl.return_id
    WHERE  r.source_type = 'purchase_order'
      AND  rl.receival_item_id IS NULL
    ORDER  BY r.created_at ASC, rl.id ASC
  LOOP
    v_assigned := false;

    FOR v_candidate IN
      SELECT ri.id, ri.qty_received
      FROM   public.receival_items ri
      JOIN   public.receivals rc ON rc.id = ri.receival_id
      WHERE  ri.brand_variant_id = v_line.brand_variant_id
        AND  rc.warehouse_id     = v_line.restock_warehouse_id
      ORDER  BY rc.created_at ASC, ri.id ASC
    LOOP
      SELECT v_candidate.qty_received
             - COALESCE((SELECT SUM(rl2.qty) FROM public.return_lines rl2 WHERE rl2.receival_item_id = v_candidate.id), 0)
        INTO v_remaining_qty;

      IF v_remaining_qty >= v_line.qty THEN
        UPDATE public.return_lines SET receival_item_id = v_candidate.id WHERE id = v_line.id;
        v_assigned := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_assigned THEN
      RAISE EXCEPTION 'Backfill failed for return_lines.id=% (return_number=%, brand_variant=%, qty=%): no receival_items row at warehouse % has enough remaining qty. Manual reconciliation required.',
        v_line.id, v_line.return_number, v_line.brand_variant_id, v_line.qty, v_line.restock_warehouse_id;
    END IF;
  END LOOP;
END $$;
