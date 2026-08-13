-- Fix: approving an 'increase' stock adjustment failed with
--   ERROR: column "received_date" of relation "fifo_cost_layers" does not exist
-- The INSERT in approve_stock_adjustment_inventory used three column names that
-- do not exist on fifo_cost_layers: received_date / qty_received / qty_remaining.
-- The real columns are date / qty / remaining_qty (verified live). This is the
-- ONLY function with the mismatch (every other fifo writer, incl.
-- approve_receival_inventory, already uses the correct names — receivals work).
--
-- Also set source_type='adjustment' + source_id=<adjustment id> on the created
-- layer (previously omitted → defaulted to source_type='receival', mislabelling
-- an adjustment-sourced layer as a receival and leaving it untraceable).
--
-- Body sourced live via pg_get_functiondef (baseline schema is stale); only the
-- fifo_cost_layers INSERT changed — every other statement is byte-identical.

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
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
  v_damaged_unit_cost   numeric;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id, source_pile
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

  IF v_adj.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % has no sub_container_id; re-open the adjustment dialog and pick one.', p_adjustment_id;
  END IF;
  v_sub_container_id := v_adj.sub_container_id;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  -- ── Phase F: damaged-pile writeoff branch ─────────────────────────────
  IF v_adj.source_pile = 'damaged' THEN
    IF v_adj.adjustment_type <> 'write_off' THEN
      RAISE EXCEPTION 'source_pile=damaged only supports adjustment_type=write_off (got %)', v_adj.adjustment_type;
    END IF;

    SELECT weighted_unit_cost
    INTO   v_damaged_unit_cost
    FROM   public.inventory_damaged_stock
    WHERE  warehouse_id = v_adj.warehouse_id AND brand_variant_id = v_adj.brand_variant_id;
    v_damaged_unit_cost := COALESCE(v_damaged_unit_cost, 0);

    PERFORM public._consume_damaged_stock_fifo(v_adj.warehouse_id, v_adj.brand_variant_id, v_qty);

    INSERT INTO public.inventory_damaged_movements (
      movement_type, qty, warehouse_id, brand_variant_id, unit_cost, notes
    ) VALUES (
      'damaged_write_off', v_qty, v_adj.warehouse_id, v_adj.brand_variant_id, v_damaged_unit_cost,
      v_adj.reason
    );
    RETURN;
  END IF;

  SELECT * INTO v_bv FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id FOR UPDATE;

  IF v_adj.adjustment_type = 'increase' THEN
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id, source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id, 'adjustment', p_adjustment_id
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

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(
        v_adj.brand_variant_id,
        v_adj.warehouse_id,
        v_qty,
        false,
        v_sub_container_id
      )
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

      -- C3 fix: for 'damage' adjustments, materialise the damaged-pile
      -- rows so downstream damaged-stock operations can consume them.
      IF v_adj.adjustment_type = 'damage' THEN
        INSERT INTO inventory_damaged_stock_layers (
          warehouse_id, brand_variant_id,
          qty_received, qty_remaining, unit_cost, layered_at
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.qty_taken, v_layer.unit_cost, now()
        );

        INSERT INTO inventory_damaged_stock (
          warehouse_id, brand_variant_id, qty, weighted_unit_cost, updated_at
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.unit_cost, now()
        )
        ON CONFLICT (warehouse_id, brand_variant_id) DO UPDATE
          SET qty = inventory_damaged_stock.qty + EXCLUDED.qty,
              weighted_unit_cost =
                (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost
                   + EXCLUDED.qty * EXCLUDED.weighted_unit_cost)
                / NULLIF(inventory_damaged_stock.qty + EXCLUDED.qty, 0),
              updated_at = now();

        INSERT INTO inventory_damaged_movements (
          movement_type, qty, warehouse_id, brand_variant_id, unit_cost, notes
        ) VALUES (
          'damaged_adjust', v_layer.qty_taken, v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.unit_cost, v_adj.reason
        );
      END IF;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$;
