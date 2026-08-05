-- Warehouse Model v2 — Phase D.4.b Task 5 (subsumes D.4 Task 3)
-- rpc_process_return_restock: per-line derive of source warehouse + sub-container
-- from return_lines.sale_delivery_line_id (added in D.4.b Task 1). Stamps
-- sub_container_id on the restored fifo_cost_layers row and the inventory
-- movement. Hard-fails if the line has no delivery link. Replaces the previous
-- warehouse-and-division-scoped _find_or_create_sub_container fallback which
-- could silently misattribute across sub-containers.

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

  -- Note: restock_warehouse_id is no longer required on the header. Each line
  -- derives its restock destination from the source delivery_line's warehouse
  -- + sub-container. This closes the D.4.b scope-leak class where the header
  -- picked a single warehouse but the SO's stock came from several.

  SELECT count(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  -- Iterate GOOD lines only. Damaged lines wait for an explicit disposition
  -- action (write_off / restock_as_damaged / send_for_repair).
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
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.b. Contact ops to reconcile the return before restocking.';
    END IF;

    -- Per-line derive: source warehouse + sub-container from the delivery-line's
    -- cogs entry pointing to the exact FIFO layer originally drained.
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

    IF v_line_warehouse IS NULL OR v_line_sub_container IS NULL THEN
      RAISE EXCEPTION 'Return line %: cannot resolve source warehouse/sub-container from delivery_line % (missing cogs_entries.source_id chain).',
        v_line.id, v_line.sale_delivery_line_id
        USING HINT = 'This delivery predates the cogs_entries.source_id column (D.3). Contact ops to reconcile.';
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
        source_type, source_id, division_id,
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
        v_return.division_id,
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
        v_return.division_id,
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

    UPDATE inventory_item_brand_variants
    SET    stock_level = stock_level + v_line.qty,
           updated_at  = now()
    WHERE  id = v_line.brand_variant_id;

    PERFORM recalc_average_cost(v_line.brand_variant_id);
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;
