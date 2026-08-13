-- Money-Path Fix C4 (follow-up): rpc_process_po_return_dispatch must derive
-- warehouse_id per return_line from the linked receival, not from the return
-- header.
--
-- Symptom observed on staging after 20260815003900: dispatch failed with
-- "Insufficient stock: requested N, missing N units for variant …" on
-- perfectly stocked variants. Diagnostic showed:
--   * so_po_returns.restock_warehouse_id = NULL   (D.4-era return)
--   * fifo_cost_layers.warehouse_id      = <real UUID>
--   * receival_items.sub_container_id    = <real UUID>
--
-- Root cause: post-D.4 the return header's restock_warehouse_id is
-- intentionally NULL — provenance for a PO return lives on the individual
-- return_line via receival_item_id (see D.4.a). The dispatch RPC's
-- sub_container derivation was patched in 20260805000200, but the
-- warehouse_id filter is still v_return.restock_warehouse_id (NULL).
-- deduct_fifo_layers then filters layers with `warehouse_id IS NULL` and
-- misses every real layer.
--
-- Fix: derive v_line_warehouse_id from receivals.warehouse_id via
-- receival_items.receival_id (same JOIN we already do for sub_container).
-- Pass v_line_warehouse_id — not v_return.restock_warehouse_id — to
-- deduct_fifo_layers and stamp it on the ISM insert. The cancel RPC
-- (20260815003900) copies warehouse_id off the dispatch ISM row, so it
-- keeps working end-to-end without a separate change.

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
  v_line_warehouse_id   UUID;
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
      RAISE EXCEPTION 'PO return line % has no receival_item_id link; cannot derive source warehouse / sub-container.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.a. Cancel and re-issue through the current PO-return dialog.';
    END IF;

    -- Derive BOTH warehouse_id and sub_container_id from the linked receival.
    -- receival_items has sub_container_id directly; warehouse_id lives on the
    -- receivals header.
    SELECT r.warehouse_id, ri.sub_container_id
    INTO   v_line_warehouse_id, v_line_sub_container
    FROM   public.receival_items ri
    LEFT JOIN public.receivals r ON r.id = ri.receival_id
    WHERE  ri.id = v_line.receival_item_id;

    IF v_line_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no warehouse_id (receival header missing or unset); cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival header before re-dispatching this return.';
    END IF;

    IF v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Receival item % has no sub_container_id; cannot dispatch return line %.',
        v_line.receival_item_id, v_line.id
        USING HINT = 'Contact ops to reconcile the receival before re-dispatching this return.';
    END IF;

    -- One purchase_return movement per layer drained, scoped to the source
    -- warehouse + sub-container derived from the receival.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(
        v_bv_id,
        v_line_warehouse_id,
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
        v_line_warehouse_id,
        v_line_sub_container,
        v_bv_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'purchase_return',
        -v_layer.qty_taken,
        v_layer.unit_cost,
        'po_return',
        p_return_id,
        v_layer.layer_id,
        'Returned to supplier'
      );
    END LOOP;
  END LOOP;

  UPDATE so_po_returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_process_po_return_dispatch(uuid) TO authenticated;
