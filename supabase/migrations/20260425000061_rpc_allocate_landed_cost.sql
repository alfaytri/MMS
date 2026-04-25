BEGIN;

CREATE OR REPLACE FUNCTION allocate_landed_cost(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lc            RECORD;
  v_grand_total   NUMERIC := 0;
  v_total_remaining INT := 0;
  v_allocations   JSONB := '[]'::JSONB;
  v_bv            RECORD;
  v_bv_lc_share   NUMERIC;
  v_bv_remaining  INT;
  v_per_unit_lc   NUMERIC;
BEGIN
  -- Lock the row to prevent concurrent apply
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  -- Sum total received value across all eligible receival items
  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  -- Iterate once per brand_variant
  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                        AS item_name,
      MAX(ri.sku)                              AS sku,
      SUM(ri.qty_received)                     AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)      AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0
      END                                      AS avg_unit_cost
    FROM receival_items ri
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    -- This brand_variant's proportional share of the total LC amount
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    -- How many units are still in FIFO inventory right now
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers
     WHERE brand_variant_id = v_bv.brand_variant_id
       AND remaining_qty > 0;

    -- Build allocation record (even if nothing remains — still record the cost event)
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',  v_bv.brand_variant_id,
      'item_name',         v_bv.item_name,
      'sku',               v_bv.sku,
      'qty_received',      v_bv.qty_received,
      'qty_remaining_at_lc', v_bv_remaining,
      'original_unit_cost', ROUND(v_bv.avg_unit_cost, 4),
      'lc_per_unit',       CASE WHEN v_bv_remaining > 0
                             THEN ROUND(v_bv_lc_share / v_bv_remaining, 4)
                             ELSE 0 END,
      'allocated_lc_total', ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',  CASE WHEN v_bv_remaining > 0
                              THEN ROUND(v_bv.avg_unit_cost + v_bv_lc_share / v_bv_remaining, 4)
                              ELSE ROUND(v_bv.avg_unit_cost, 4) END,
      -- Legacy alias expected by existing UI:
      'allocated_cost',    ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    -- Only touch FIFO layers if units remain
    IF v_bv_remaining > 0 THEN
      v_per_unit_lc := v_bv_lc_share / v_bv_remaining;

      -- Push LC cost into all remaining FIFO layers for this variant
      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0;

      -- Recompute average_cost on the brand_variant row
      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      -- Record the cost-adjustment movement
      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_bv_lc_share, 2) || ' QAR over '
           || v_bv_remaining || ' units');

      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;
  END LOOP;

  -- Stamp the landed_cost as applied
  UPDATE landed_costs
     SET item_allocations = v_allocations,
         applied_at       = now(),
         all_items_sold   = (v_total_remaining = 0),
         updated_at       = now()
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_landed_cost(UUID) TO authenticated;

COMMIT;
