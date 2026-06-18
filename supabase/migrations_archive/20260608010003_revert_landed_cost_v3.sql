-- LC-COGS Attribution v3 — revert also inserts reversing cogs_entries rows.
-- Replaces the revert_landed_cost from 20260425000301_lc_revert_v2.sql.

BEGIN;

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
  v_now     TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has not been applied', p_lc_id;
  END IF;

  -- ── Inventory side: subtract per-layer delta from snapshot ────────────────
  IF v_lc.revert_snapshot IS NOT NULL AND jsonb_array_length(v_lc.revert_snapshot) > 0 THEN
    FOR v_layer IN SELECT * FROM jsonb_array_elements(v_lc.revert_snapshot) LOOP
      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit - (v_layer->>'lc_per_unit_delta')::NUMERIC,
             total_unit_cost      = total_unit_cost      - (v_layer->>'lc_per_unit_delta')::NUMERIC
       WHERE id = (v_layer->>'layer_id')::UUID;

      v_bv_id := (v_layer->>'brand_variant_id')::UUID;
      IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
        v_bv_ids := v_bv_ids || v_bv_id;
      END IF;
    END LOOP;

    FOREACH v_bv_id IN ARRAY v_bv_ids LOOP
      PERFORM recalc_average_cost(v_bv_id);
    END LOOP;

    -- Reversing inventory_stock_movements (audit-friendly; never deletes)
    INSERT INTO inventory_stock_movements
      (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
       reference_type, reference_id, notes)
    SELECT
      brand_variant_id, item_name, sku, 'cost_adjustment', qty,
      -unit_cost, 'landed_cost', p_lc_id,
      'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
    FROM inventory_stock_movements
    WHERE reference_type = 'landed_cost'
      AND reference_id   = p_lc_id
      AND movement_type  = 'cost_adjustment'
      AND unit_cost      > 0;   -- only original positives; never re-reverse a prior reversal
  END IF;

  -- ── COGS side: insert reversing rows for each original LC-adjustment row ──
  INSERT INTO cogs_entries (
    brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
    qty, unit_cost, total_cost, date, notes
  )
  SELECT
    brand_variant_id, NULL, NULL, p_lc_id,
    -qty, unit_cost, -total_cost, v_now::DATE,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
  FROM cogs_entries
  WHERE landed_cost_id = p_lc_id
    AND total_cost     > 0;   -- only original positives; never re-reverse a prior reversal

  -- ── Reset the LC ──────────────────────────────────────────────────────────
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         item_allocations = NULL,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_landed_cost(UUID, TEXT) TO authenticated;

COMMIT;
