-- Warehouse Model v2 — Phase D.4.b Task 1
-- Add sale_delivery_line_id link on return_lines. Backfill existing SO-source rows
-- by FIFO-matching against sale_delivery_lines for the same SO + brand_variant.

ALTER TABLE public.return_lines
  ADD COLUMN sale_delivery_line_id uuid REFERENCES public.sale_delivery_lines(id);

CREATE INDEX return_lines_sale_delivery_line_id_idx
  ON public.return_lines(sale_delivery_line_id)
  WHERE sale_delivery_line_id IS NOT NULL;

COMMENT ON COLUMN public.return_lines.sale_delivery_line_id IS
  'For SO-source returns: which sale_delivery_lines row this line is returning stock from. Drives sub-container-scoped restock in rpc_process_return_restock. NULL for PO-source returns (they use receival_item_id instead).';

-- Backfill: FIFO-match each existing SO-source return_line against sale_delivery_lines
-- for the same SO + brand_variant. Oldest delivery first, respecting remaining qty
-- already claimed by other backfilled rows in this batch.

DO $$
DECLARE
  v_line          RECORD;
  v_candidate     RECORD;
  v_remaining_qty integer;
  v_assigned      boolean;
BEGIN
  FOR v_line IN
    SELECT rl.id, rl.qty, rl.brand_variant_id, r.source_id AS so_id, r.return_number
    FROM   public.return_lines rl
    JOIN   public.so_po_returns r ON r.id = rl.return_id
    WHERE  r.source_type = 'sale_order'
      AND  rl.sale_delivery_line_id IS NULL
      AND  rl.brand_variant_id IS NOT NULL
    ORDER  BY r.created_at ASC, rl.id ASC
  LOOP
    v_assigned := false;

    FOR v_candidate IN
      SELECT sdl.id, sdl.qty_delivered
      FROM   public.sale_delivery_lines sdl
      JOIN   public.sale_deliveries     sd ON sd.id = sdl.sale_delivery_id
      WHERE  sd.sale_order_id     = v_line.so_id
        AND  sdl.brand_variant_id = v_line.brand_variant_id
      ORDER  BY sd.date ASC, sd.created_at ASC, sdl.id ASC
    LOOP
      SELECT v_candidate.qty_delivered
             - COALESCE((SELECT SUM(rl2.qty) FROM public.return_lines rl2 WHERE rl2.sale_delivery_line_id = v_candidate.id), 0)
        INTO v_remaining_qty;

      IF v_remaining_qty >= v_line.qty THEN
        UPDATE public.return_lines SET sale_delivery_line_id = v_candidate.id WHERE id = v_line.id;
        v_assigned := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_assigned THEN
      RAISE EXCEPTION 'Backfill failed for return_lines.id=% (return_number=%, brand_variant=%, qty=%): no sale_delivery_lines row on SO % has enough remaining qty. Manual reconciliation required.',
        v_line.id, v_line.return_number, v_line.brand_variant_id, v_line.qty, v_line.so_id;
    END IF;
  END LOOP;
END $$;
