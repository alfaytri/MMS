-- Warehouse Model v2 — Phase E follow-up
--
-- Symptom: during Phase E smoke, sale-return restock (RPC
-- rpc_process_return_restock) raised P0001 on a pre-D.3 delivery whose
-- cogs_entries.source_id chain to fifo_cost_layers was broken. The Phase E
-- fallback shortened to (return.division_id → sale_orders.division_id) —
-- both were null on this SO, so the RPC aborted.
--
-- Fix: add a third fallback that reads division_id from cogs_entries. That
-- column was preserved by Phase E (cogs_entries wasn't in the drop set) and
-- is stamped on every legacy delivery COGS row, so it's the best surviving
-- ground truth for "which division consumed this stock" when the sale_order
-- header itself is missing division_id.
--
-- The RPC continues to require sub_container_id on the fifo_cost_layer it
-- creates; the sub-container is resolved via _find_or_create_sub_container
-- once the division falls out of the cascade.

CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return             RECORD;
  v_line               RECORD;
  v_cogs               RECORD;
  v_qty_remaining      int;
  v_qty_this_chunk     numeric;
  v_available_qty      numeric;
  v_pending_insp       int;
  v_line_warehouse     uuid;
  v_line_sub_container uuid;
  v_fallback_division  uuid;
BEGIN
  SELECT id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status <> 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  END IF;

  IF v_return.source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  END IF;

  SELECT count(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes,
           sale_delivery_line_id
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
      AND  condition = 'good'
  LOOP
    IF v_line.sale_delivery_line_id IS NULL THEN
      RAISE EXCEPTION 'Return line % has no sale_delivery_line_id link; cannot derive restock destination.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.b. Contact ops to reconcile.';
    END IF;

    SELECT sd.warehouse_id,
           fcl.sub_container_id
    INTO   v_line_warehouse, v_line_sub_container
    FROM   public.sale_delivery_lines sdl
    JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
    JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                         AND ce.brand_variant_id = sdl.brand_variant_id
    JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
    WHERE  sdl.id = v_line.sale_delivery_line_id
    ORDER  BY ce.created_at ASC
    LIMIT  1;

    -- Fallback for pre-D.3 deliveries. Phase E: division-derive cascade
    -- runs return → sale_order → cogs_entries. Warehouse-based fallback
    -- is gone (warehouses.division_id was dropped in Phase E).
    IF v_line_warehouse IS NULL OR v_line_sub_container IS NULL THEN
      SELECT sd.warehouse_id
      INTO   v_line_warehouse
      FROM   public.sale_delivery_lines sdl
      JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
      WHERE  sdl.id = v_line.sale_delivery_line_id;

      IF v_line_warehouse IS NULL THEN
        RAISE EXCEPTION 'Return line %: cannot resolve warehouse from delivery_line %.',
          v_line.id, v_line.sale_delivery_line_id;
      END IF;

      v_fallback_division := v_return.division_id;

      IF v_fallback_division IS NULL THEN
        SELECT so.division_id
        INTO   v_fallback_division
        FROM   public.sale_orders so
        WHERE  so.id = v_return.source_id;
      END IF;

      -- Phase E follow-up: cogs_entries.division_id is preserved and
      -- reliably populated on every delivery COGS row, so it's the last
      -- and most permissive fallback before we give up.
      IF v_fallback_division IS NULL THEN
        SELECT ce.division_id
        INTO   v_fallback_division
        FROM   public.cogs_entries ce
        WHERE  ce.sale_order_id      = v_return.source_id
          AND  ce.brand_variant_id   = v_line.brand_variant_id
          AND  ce.division_id IS NOT NULL
        ORDER  BY ce.date ASC, ce.created_at ASC
        LIMIT  1;
      END IF;

      IF v_fallback_division IS NULL THEN
        RAISE EXCEPTION 'Return line %: pre-D.3 delivery has no source_id chain AND division cannot be resolved from return, sale_order, or cogs_entries.',
          v_line.id
          USING HINT = 'Set division_id on the return, sale_order, or the delivery COGS row before restocking.';
      END IF;

      v_line_sub_container := public._find_or_create_sub_container(v_line_warehouse, v_fallback_division);
    END IF;

    SELECT coalesce(sum(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      FROM   cogs_entries
      WHERE  sale_order_id = v_return.source_id
        AND  brand_variant_id = v_line.brand_variant_id
        AND  qty > 0
      ORDER  BY date ASC, unit_cost ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id,
        sub_container_id
      ) VALUES (
        v_line.brand_variant_id,
        v_line_warehouse,
        current_date,
        v_qty_this_chunk,
        v_cogs.unit_cost,
        0,
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_line_sub_container
      );

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) VALUES (
        v_line.brand_variant_id,
        v_cogs.sale_delivery_id,
        v_cogs.sale_order_id,
        -v_qty_this_chunk,
        v_cogs.unit_cost,
        -(v_qty_this_chunk * v_cogs.unit_cost),
        current_date,
        'sale_return',
        coalesce(v_return.division_id, v_cogs.division_id, v_fallback_division),
        'Reversed by return ' || v_return.return_number
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_line_warehouse,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number,
        v_line_sub_container
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_process_return_restock(uuid) IS
'Warehouse Model v2 Phase E + follow-up. Restocks good-condition sale-return lines
via cogs_entries → fifo_cost_layers cascade, falling back to
(return.division_id → sale_orders.division_id → cogs_entries.division_id) when the
source_id chain is broken (legacy pre-D.3 deliveries).';
