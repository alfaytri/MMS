-- Money-Path Fix C3 + C4: rpc_cancel_po_return_dispatch restores FIFO layers
-- and inserts reversing stock movements with warehouse_id + sub_container_id.
--
-- Before this migration, the live cancel body:
--   (bug 0) referenced `inventory_brand_variants` — that table was renamed to
--           `inventory_item_brand_variants` on 2026-07-24 and its compat view
--           dropped on 2026-07-25, so cancel already errored on the very first
--           UPDATE with "relation does not exist".
--   (C3)    never restored fifo_cost_layers.remaining_qty that dispatch's
--           deduct_fifo_layers call drained → next FIFO consumption picked the
--           wrong layer/cost and eventually "Insufficient stock" surfaced when
--           SUM(remaining_qty) fell below stock_level.
--   (C4)    inserted inventory_stock_movements rows with warehouse_id from
--           so_po_returns.restock_warehouse_id (which is nullable on D.4-era
--           returns) and no sub_container_id at all — sub_container_id has
--           been NOT NULL since 20260803001000, so every cancel raised
--           "null value in column sub_container_id violates not-null".
--
-- This migration:
--   1. Adds nullable inventory_stock_movements.source_id so dispatch can stamp
--      which fifo_cost_layers row each per-layer drain came from.
--   2. Rewrites rpc_process_po_return_dispatch to stamp source_id = layer_id
--      on every per-layer ISM insert. Body is otherwise identical to
--      20260805000200 (Phase D.4 sub-container scoping).
--   3. Rewrites rpc_cancel_po_return_dispatch to:
--        - walk each dispatch ISM row (source_id IS NOT NULL) for this return;
--        - UPDATE fifo_cost_layers.remaining_qty += ABS(qty) via source_id;
--        - bump inventory_item_brand_variants.stock_level;
--        - INSERT a mirror 'purchase_return_cancelled' ISM row carrying the
--          SAME warehouse_id + sub_container_id as the dispatch row (so the
--          NOT NULL constraint holds);
--        - call recalc_average_cost() for each distinct brand variant touched;
--        - clear so_po_returns.dispatched_at.
--      Legacy dispatched returns (ISM rows written before this migration ⇒
--      source_id IS NULL) can't be reversed automatically — cancel RAISES
--      with a reconcile hint instead of corrupting FIFO further.

-- ─── 1. Column + index ─────────────────────────────────────────────────────

ALTER TABLE public.inventory_stock_movements
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_stock_movements_source_id
  ON public.inventory_stock_movements(source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_stock_movements.source_id IS
  'Polymorphic reference — target depends on movement_type. For '
  '''purchase_return'' / ''purchase_return_cancelled'' rows this is the '
  'fifo_cost_layers row that was drained (or restored). Populated by the '
  'Money-Path C3+C4 fix (2026-08-05); NULL on older rows.';

-- ─── 2. rpc_process_po_return_dispatch — stamp source_id on ISM ───────────

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return              RECORD;
  v_line                RECORD;
  v_bv_id               UUID;
  v_line_sub_container  UUID;
  v_layer               RECORD;
BEGIN
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, receival_item_id
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing.
    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_item_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_line.receival_item_id IS NULL THEN
      RAISE EXCEPTION 'PO return line % has no receival_item_id link; cannot derive source sub-container.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.a. Cancel and re-issue through the current PO-return dialog.';
    END IF;

    SELECT ri.sub_container_id
    INTO   v_line_sub_container
    FROM   public.receival_items ri
    WHERE  ri.id = v_line.receival_item_id;

    IF v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no sub_container_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival before re-dispatching this return.';
    END IF;

    -- One purchase_return movement per layer drained, scoped to the source sub-container.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_bv_id,
        v_return.restock_warehouse_id,
        v_line.qty,
        false,
        v_line_sub_container
      )
    LOOP
      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, source_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_line_sub_container,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        v_layer.layer_id,   -- ← Money-path C3+C4: layer id for reversal
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_process_po_return_dispatch(uuid) TO authenticated;

-- ─── 3. rpc_cancel_po_return_dispatch — restore FIFO + insert reversal ─────

CREATE OR REPLACE FUNCTION public.rpc_cancel_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return        RECORD;
  v_mv            RECORD;
  v_qty_returned  INT;
  v_legacy_count  INT;
BEGIN
  SELECT id, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    -- Never dispatched, or already cancelled. Idempotent no-op.
    RETURN;
  END IF;

  -- Guard: dispatch ISM rows without source_id come from the pre-fix RPC.
  -- Their per-layer breakdown is lost, so we cannot reverse them safely.
  SELECT count(*) INTO v_legacy_count
  FROM   inventory_stock_movements m
  WHERE  m.reference_type = 'po_return'
    AND  m.reference_id   = p_return_id
    AND  m.movement_type  = 'purchase_return'
    AND  m.source_id IS NULL;

  IF v_legacy_count > 0 THEN
    RAISE EXCEPTION
      'Cannot cancel PO return %: % dispatch movement(s) predate the FIFO-restore fix (missing source_id). Their per-layer breakdown is lost.',
      p_return_id, v_legacy_count
      USING HINT = 'Reconcile FIFO for the affected brand variants manually, then mark the return closed with a stock adjustment.';
  END IF;

  -- Walk each unpaired dispatch drain, restore its layer, insert reversal.
  FOR v_mv IN
    SELECT m.id, m.warehouse_id, m.sub_container_id, m.brand_variant_id,
           m.item_name, m.sku, m.qty, m.unit_cost, m.source_id
    FROM   inventory_stock_movements m
    WHERE  m.reference_type = 'po_return'
      AND  m.reference_id   = p_return_id
      AND  m.movement_type  = 'purchase_return'
      AND  m.source_id IS NOT NULL
      AND  NOT EXISTS (
        -- Defensive: skip drains that already have a matching reversal
        -- from a previous cancel of an earlier dispatch cycle.
        SELECT 1 FROM inventory_stock_movements c
        WHERE  c.reference_type = 'po_return'
          AND  c.reference_id   = p_return_id
          AND  c.movement_type  = 'purchase_return_cancelled'
          AND  c.source_id      = m.source_id
          AND  c.qty            = -m.qty
          AND  c.sub_container_id IS NOT DISTINCT FROM m.sub_container_id
      )
  LOOP
    v_qty_returned := ABS(v_mv.qty);

    -- Restore the exact FIFO layer dispatch drained.
    UPDATE fifo_cost_layers
    SET    remaining_qty = remaining_qty + v_qty_returned
    WHERE  id = v_mv.source_id;

    -- Bump variant stock_level (deduct_fifo_layers decremented it on dispatch).
    UPDATE inventory_item_brand_variants
    SET    stock_level = stock_level + v_qty_returned,
           updated_at  = now()
    WHERE  id = v_mv.brand_variant_id;

    -- Mirror reversing movement — carries the SAME warehouse_id + sub_container_id.
    INSERT INTO inventory_stock_movements (
      warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, source_id, notes
    ) VALUES (
      v_mv.warehouse_id,
      v_mv.sub_container_id,
      v_mv.brand_variant_id,
      v_mv.item_name,
      v_mv.sku,
      'purchase_return_cancelled',
      v_qty_returned,
      v_mv.unit_cost,
      'po_return',
      p_return_id,
      v_mv.source_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  -- Refresh weighted average cost for each brand variant we touched.
  PERFORM recalc_average_cost(t.bv_id)
  FROM (
    SELECT DISTINCT brand_variant_id AS bv_id
    FROM   inventory_stock_movements
    WHERE  reference_type = 'po_return'
      AND  reference_id   = p_return_id
      AND  movement_type  = 'purchase_return_cancelled'
      AND  brand_variant_id IS NOT NULL
  ) t;

  UPDATE so_po_returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_po_return_dispatch(uuid) TO authenticated;
