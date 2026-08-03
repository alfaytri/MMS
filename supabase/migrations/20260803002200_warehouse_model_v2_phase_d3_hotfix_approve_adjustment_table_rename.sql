-- Hotfix: approve_stock_adjustment_inventory still referenced the pre-rename
-- table `inventory_brand_variants` (renamed to `inventory_item_brand_variants`
-- on 2026-07-24; the compat view was dropped). Swap the three references so
-- adjustment approvals stop failing with "relation does not exist".
-- Body sourced from pg_get_functiondef on the live DB; only the table name
-- differs from the deployed version.

CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj                 RECORD;
  v_bv                  RECORD;
  v_layer               RECORD;
  v_qty                 INT;
  v_division_id         UUID;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  -- Resolve sub-container. Prefer whatever the client already stamped on
  -- the adjustment; otherwise derive from the target warehouse's division
  -- (adjustments carry no explicit division param).
  IF v_adj.sub_container_id IS NOT NULL THEN
    v_sub_container_id := v_adj.sub_container_id;
  ELSE
    SELECT division_id INTO v_division_id
    FROM warehouses
    WHERE id = v_adj.warehouse_id;

    v_sub_container_id := public._find_or_create_sub_container(v_adj.warehouse_id, v_division_id);
  END IF;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes,
      sub_container_id
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason,
      v_sub_container_id
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_item_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    -- One movement per layer drained. Read sub_container_id back from
    -- each drained fifo_cost_layers row (Phase B backfilled these; legacy
    -- nulls fall back to the adjustment's resolved sub-container).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false)
    LOOP
      v_layer_sub_container := COALESCE(v_layer.sub_container_id, v_sub_container_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason,
        v_layer_sub_container
      );
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$;
