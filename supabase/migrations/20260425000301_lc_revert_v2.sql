-- supabase/migrations/20260425000301_lc_revert_v2.sql
-- Fixes applied after code review:
--   1. allocate_landed_cost: snapshot stores per-unit delta (not absolute values) so
--      reverting LC #1 never overwrites costs added by LC #2 on the same FIFO layers.
--   2. revert_landed_cost: subtract delta instead of overwriting; insert reversing
--      stock movements instead of deleting (audit trail preserved); accept p_performer_name
--      so the reversing entry records who authorised the rollback.
--   3. batch_update_variant_prices: single-transaction RPC replaces client-side Promise.all.

BEGIN;

-- ── 1. Replace allocate_landed_cost — snapshot stores lc_per_unit_delta ──────
CREATE OR REPLACE FUNCTION allocate_landed_cost(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc              RECORD;
  v_grand_total     NUMERIC := 0;
  v_total_remaining BIGINT  := 0;
  v_allocations     JSONB   := '[]'::JSONB;
  v_snapshot        JSONB   := '[]'::JSONB;
  v_bv              RECORD;
  v_bv_lc_share     NUMERIC;
  v_bv_remaining    BIGINT;
  v_per_unit_lc     NUMERIC;
BEGIN
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

  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free    = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

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
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free     = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    -- Lock FIFO layers and compute total remaining qty
    WITH locked_layers AS (
      SELECT remaining_qty
        FROM fifo_cost_layers
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0
       FOR UPDATE
    )
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM locked_layers;

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',    v_bv.brand_variant_id,
      'item_name',           v_bv.item_name,
      'sku',                 v_bv.sku,
      'qty_received',        v_bv.qty_received,
      'qty_remaining_at_lc', v_bv_remaining,
      'original_unit_cost',  ROUND(v_bv.avg_unit_cost, 4),
      'lc_per_unit',         CASE WHEN v_bv_remaining > 0
                               THEN ROUND(v_bv_lc_share / v_bv_remaining, 4)
                               ELSE 0 END,
      'allocated_lc_total',  ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',   CASE WHEN v_bv_remaining > 0
                               THEN ROUND(v_bv.avg_unit_cost + v_bv_lc_share / v_bv_remaining, 4)
                               ELSE ROUND(v_bv.avg_unit_cost, 4) END,
      'allocated_cost',      ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    IF v_bv_remaining > 0 THEN
      v_per_unit_lc := v_bv_lc_share / v_bv_remaining;

      -- Snapshot stores the delta applied to each layer (rows already locked above).
      -- Storing only the delta — not absolute values — means a later revert of THIS LC
      -- safely subtracts only its own contribution without touching costs from other LCs.
      SELECT v_snapshot || COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'layer_id',          id::TEXT,
          'brand_variant_id',  brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ))
        FROM fifo_cost_layers
        WHERE brand_variant_id = v_bv.brand_variant_id
          AND remaining_qty > 0),
        '[]'::JSONB
      )
      INTO v_snapshot;

      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty > 0;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_bv_lc_share, 2) || ' ' || v_lc.currency || ' over '
           || v_bv_remaining || ' units');

      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET item_allocations = v_allocations,
         applied_at       = now(),
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = now()
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

-- ── 2. Replace revert_landed_cost — delta subtraction + reversing movements ───
CREATE OR REPLACE FUNCTION revert_landed_cost(p_lc_id UUID, p_performer_name TEXT DEFAULT 'System')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc      RECORD;
  v_layer   JSONB;
  v_bv_ids  UUID[] := '{}';
  v_bv_id   UUID;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;
  IF v_lc.revert_snapshot IS NULL OR jsonb_array_length(v_lc.revert_snapshot) = 0 THEN
    RAISE EXCEPTION 'No revert snapshot available for landed cost %', p_lc_id;
  END IF;

  -- Subtract only this LC's delta from each FIFO layer.
  -- Other LCs applied to the same layers are unaffected.
  FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
    UPDATE fifo_cost_layers
       SET landed_cost_per_unit = landed_cost_per_unit - (v_layer->>'lc_per_unit_delta')::NUMERIC,
           total_unit_cost      = total_unit_cost      - (v_layer->>'lc_per_unit_delta')::NUMERIC
     WHERE id = (v_layer->>'layer_id')::UUID;

    -- Accumulate distinct brand_variant_ids — recalc runs once per variant, not per layer
    v_bv_id := (v_layer->>'brand_variant_id')::UUID;
    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost once per brand variant (after all layers updated)
  FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  -- Insert reversing stock movements — never delete ledger entries (audit compliance)
  INSERT INTO inventory_stock_movements
    (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
     reference_type, reference_id, notes)
  SELECT
    brand_variant_id,
    item_name,
    sku,
    'cost_adjustment',
    qty,
    -unit_cost,
    'landed_cost',
    p_lc_id,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
  FROM inventory_stock_movements
  WHERE reference_type = 'landed_cost'
    AND reference_id   = p_lc_id
    AND movement_type  = 'cost_adjustment'
    AND unit_cost      > 0;  -- guard: only reverse original positive entries

  -- Reset the landed_cost record
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         item_allocations = NULL,
         revert_snapshot  = NULL,
         updated_at       = now()
   WHERE id = p_lc_id;
END;
$$;

-- ── 3. Batch variant price update — single transaction, no N HTTP round-trips ──
CREATE OR REPLACE FUNCTION batch_update_variant_prices(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update JSONB;
BEGIN
  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates) LOOP
    UPDATE inventory_brand_variants
       SET selling_price  = (v_update->>'selling_price')::NUMERIC,
           margin_percent = (v_update->>'margin_percent')::NUMERIC
     WHERE id = (v_update->>'id')::UUID;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_landed_cost(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION revert_landed_cost(UUID, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION batch_update_variant_prices(JSONB) TO authenticated;

COMMIT;
