-- Warehouse Model v2 — Phase F, migration 1/3
--
-- Adds a `source_pile` column to `stock_adjustments` so writeoffs can
-- distinguish between draining the good (FIFO) pile and draining the
-- damaged pile (`inventory_damaged_stock`). Backfills existing rows to
-- 'good' (correct — every SA in flight today targets the FIFO pile).
--
-- Approver RPC `approve_stock_adjustment_inventory` is extended so a
-- writeoff SA with source_pile='damaged' consumes from the damaged pile
-- via `_consume_damaged_stock_fifo` and logs `inventory_damaged_movements`
-- with movement_type='writeoff' — no FIFO deduct, no cogs_entries write.
--
-- The rest of the RPC's behavior is preserved byte-for-byte from
-- 20260810000100_phase_e_rpc_rewrites.sql.

-- 1. Column ────────────────────────────────────────────────────────────
ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS source_pile text NOT NULL DEFAULT 'good';

ALTER TABLE public.stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_source_pile_check;

ALTER TABLE public.stock_adjustments
  ADD CONSTRAINT stock_adjustments_source_pile_check
  CHECK (source_pile IN ('good', 'damaged'));

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_source_pile
  ON public.stock_adjustments (source_pile)
  WHERE source_pile = 'damaged';

COMMENT ON COLUMN public.stock_adjustments.source_pile IS
'Phase F. Which inventory pile the adjustment consumes from — ''good''
(FIFO layers, the default and existing behavior) or ''damaged''
(inventory_damaged_stock). Only ''write_off'' + ''damaged'' combinations
consume from the damaged pile; every other combination still uses FIFO.';

-- 2. Approver RPC ──────────────────────────────────────────────────────
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

  -- Phase E: sub_container_id is required on every SA.
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
  -- source_pile='damaged' means this SA was created via the Damaged Stock
  -- On-hand action. Bypass the FIFO path: consume from inventory_damaged_stock
  -- via the helper + log the writeoff movement. No cogs_entries, no FIFO
  -- layer change, no damaged_qty maintenance (the follow-up #7 trigger on
  -- inventory_damaged_stock handles the denormalized counter).
  IF v_adj.source_pile = 'damaged' THEN
    IF v_adj.adjustment_type <> 'write_off' THEN
      RAISE EXCEPTION 'source_pile=damaged only supports adjustment_type=write_off (got %)', v_adj.adjustment_type;
    END IF;

    SELECT weighted_unit_cost
    INTO   v_damaged_unit_cost
    FROM   public.inventory_damaged_stock
    WHERE  warehouse_id     = v_adj.warehouse_id
      AND  brand_variant_id = v_adj.brand_variant_id;
    v_damaged_unit_cost := COALESCE(v_damaged_unit_cost, 0);

    PERFORM public._consume_damaged_stock_fifo(v_adj.warehouse_id, v_adj.brand_variant_id, v_qty);

    INSERT INTO public.inventory_damaged_movements (
      movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
      notes, created_by
    ) VALUES (
      'damaged_write_off', v_qty, v_adj.warehouse_id, v_adj.brand_variant_id, v_damaged_unit_cost,
      COALESCE(v_adj.reason, 'Damaged writeoff approved via stock adjustment ' || p_adjustment_id),
      NULL
    );

    RETURN;
  END IF;

  -- ── Existing (good-pile) branches — preserved byte-for-byte from Phase E ─
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
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.approve_stock_adjustment_inventory(uuid, text) IS
'Warehouse Model v2 Phase F. Applies an approved stock adjustment. When
source_pile=''damaged'' (write_off only), consumes from inventory_damaged_stock
via _consume_damaged_stock_fifo and logs an inventory_damaged_movements
row of movement_type=''writeoff''. Otherwise runs the existing FIFO path
against fifo_cost_layers (increase/decrease/damage/write_off on the good
pile).';
