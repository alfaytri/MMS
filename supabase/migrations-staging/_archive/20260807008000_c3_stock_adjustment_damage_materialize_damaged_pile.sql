-- C3 (six-domains checklist): approve_stock_adjustment_inventory with
-- adjustment_type='damage' + source_pile='good' consumed good FIFO
-- layers and incremented brand_variant.damaged_qty (denormalized
-- counter) but NEVER inserted rows into inventory_damaged_stock,
-- inventory_damaged_stock_layers, or inventory_damaged_movements.
--
-- Effect: units disappeared from the good pile but the damaged-pile
-- tables stayed empty. The Damaged Stock On-hand tab showed nothing;
-- rpc_send_damaged_stock_for_repair raised "insufficient damaged
-- stock"; the write-off branch was starved because it consumes from
-- inventory_damaged_stock too.
--
-- Fix: inside the damage branch, for each FIFO layer consumed, also
-- write to all three damaged-pile tables. Weighted-average unit cost
-- on the inventory_damaged_stock upsert.
--
-- Body sourced from live pg_proc (matches migration 20260814000100).
-- Only the damage-pile-materialisation block is added.

CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      brand_variant_id, warehouse_id, received_date,
      qty_received, unit_cost, landed_cost_per_unit, total_unit_cost, qty_remaining,
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
$$;

COMMENT ON FUNCTION public.approve_stock_adjustment_inventory(uuid, text) IS
'Warehouse Model v2 Phase F. Applies an approved stock adjustment. When
source_pile=''damaged'' (write_off only), consumes from inventory_damaged_stock
via _consume_damaged_stock_fifo and logs an inventory_damaged_movements
row of movement_type=''damaged_write_off''. Otherwise runs the existing
FIFO path against fifo_cost_layers. For adjustment_type=''damage'' on the
good pile, also materialises inventory_damaged_stock_layers +
inventory_damaged_stock (weighted-average upsert) + inventory_damaged_movements
(''damaged_adjust'') so downstream damaged-pile RPCs (send-for-repair,
write-off from damaged) can consume the units — closes six-domains
checklist C3.';
