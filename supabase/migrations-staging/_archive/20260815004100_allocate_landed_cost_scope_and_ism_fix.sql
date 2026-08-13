-- Money-Path Fix C5: allocate_landed_cost FIFO layer scope leak.
--
-- Before: the RPC read v_bv_remaining as SUM(remaining_qty) across ALL layers
-- of the brand variant (ignoring which receivals the LC is actually attached
-- to), then UPDATE-stamped landed_cost_per_unit on ALL of those layers. If
-- the same variant had inventory in an unrelated warehouse or from an older
-- receival, that unrelated stock silently absorbed part of the freight cost
-- while the receival the LC was attached to got under-costed in COGS.
--
-- Fix:
--   1. Scope the v_bv_remaining SUM to layers whose source_type='receival'
--      AND source_id = ANY(v_lc.attached_receival_ids) — the polymorphic
--      source_id column has pointed at receival ids since 20260726260000.
--   2. Iterate the scoped layers with FOR UPDATE, apply the per-unit LC
--      delta per layer, and build the revert_snapshot per layer.
--   3. Emit one 'cost_adjustment' inventory_stock_movements row PER LAYER,
--      carrying that layer's warehouse_id AND sub_container_id. The old
--      body emitted a single aggregate row with neither field, which would
--      have failed the NOT NULL constraint on sub_container_id (added
--      2026-08-03) had any LC apply been executed successfully.
--
-- revert_landed_cost is unchanged — it walks revert_snapshot by layer_id,
-- so the snapshot shape is identical.

CREATE OR REPLACE FUNCTION public.allocate_landed_cost(p_lc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lc                RECORD;
  v_apply_time        TIMESTAMPTZ := now();
  v_grand_total       NUMERIC := 0;
  v_total_remaining   BIGINT  := 0;
  v_allocations       JSONB   := '[]'::JSONB;
  v_snapshot          JSONB   := '[]'::JSONB;
  v_bv                RECORD;
  v_bv_lc_share       NUMERIC;
  v_bv_remaining      BIGINT;
  v_sold              BIGINT;
  v_per_unit_lc       NUMERIC;
  v_inventory_portion NUMERIC;
  v_cogs_portion      NUMERIC;
  v_layer             RECORD;
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

  IF v_lc.attached_receival_ids IS NULL OR array_length(v_lc.attached_receival_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has no attached receivals', v_lc.lc_number;
  END IF;

  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  -- Clear any existing allocations (idempotent re-apply support).
  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                    AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0 END                          AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

    -- SCOPE FIX (C5): sum remaining_qty only over layers that came from
    -- the receivals THIS landed cost is attached to.
    SELECT COALESCE(SUM(fcl.remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers fcl
     WHERE fcl.brand_variant_id = v_bv.brand_variant_id
       AND fcl.remaining_qty    > 0
       AND fcl.source_type      = 'receival'
       AND fcl.source_id        = ANY(v_lc.attached_receival_ids);

    v_sold := GREATEST(v_bv.qty_received - v_bv_remaining, 0);

    IF v_sold <= 0 THEN
      v_inventory_portion := v_bv_lc_share;
      v_cogs_portion      := 0;
    ELSIF v_bv_remaining <= 0 THEN
      v_inventory_portion := 0;
      v_cogs_portion      := v_bv_lc_share;
    ELSE
      v_inventory_portion := ROUND(v_bv_remaining * v_per_unit_lc, 2);
      v_cogs_portion      := v_bv_lc_share - v_inventory_portion;
    END IF;

    INSERT INTO landed_cost_item_allocations (
      landed_cost_id, brand_variant_id, item_name, sku,
      qty_received, qty_remaining_at_lc, sold_qty,
      original_unit_cost, lc_per_unit, updated_unit_cost,
      allocated_lc_total, inventory_portion, cogs_portion
    ) VALUES (
      p_lc_id, v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
      v_bv.qty_received, v_bv_remaining, v_sold,
      ROUND(v_bv.avg_unit_cost, 4),
      ROUND(COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv_lc_share, 2),
      ROUND(v_inventory_portion, 2),
      ROUND(v_cogs_portion, 2)
    );

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',     v_bv.brand_variant_id,
      'item_name',            v_bv.item_name,
      'sku',                  v_bv.sku,
      'qty_received',         v_bv.qty_received,
      'qty_remaining_at_lc',  v_bv_remaining,
      'sold_qty',             v_sold,
      'original_unit_cost',   ROUND(v_bv.avg_unit_cost, 4),
      'per_unit_lc',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'lc_per_unit',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'inventory_portion',    ROUND(v_inventory_portion, 2),
      'cogs_portion',         ROUND(v_cogs_portion, 2),
      'allocated_lc_total',   ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',    ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      'allocated_cost',       ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    -- ── Inventory side ──────────────────────────────────────────────────────
    -- Iterate the SCOPED layers with FOR UPDATE. Apply the per-unit LC delta,
    -- record the layer in the revert snapshot, and emit one 'cost_adjustment'
    -- movement per layer so warehouse_id + sub_container_id are correctly
    -- stamped (the NOT NULL sub_container_id constraint would have rejected
    -- the old single aggregate insert).
    IF v_bv_remaining > 0 AND COALESCE(v_per_unit_lc, 0) <> 0 THEN
      FOR v_layer IN
        SELECT fcl.id, fcl.warehouse_id, fcl.sub_container_id, fcl.remaining_qty
          FROM fifo_cost_layers fcl
         WHERE fcl.brand_variant_id = v_bv.brand_variant_id
           AND fcl.remaining_qty    > 0
           AND fcl.source_type      = 'receival'
           AND fcl.source_id        = ANY(v_lc.attached_receival_ids)
         FOR UPDATE
      LOOP
        UPDATE fifo_cost_layers
           SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
               total_unit_cost      = total_unit_cost      + v_per_unit_lc
         WHERE id = v_layer.id;

        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'layer_id',          v_layer.id::TEXT,
          'brand_variant_id',  v_bv.brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ));

        INSERT INTO inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost,
          reference_type, reference_id, source_id, notes
        ) VALUES (
          v_layer.warehouse_id,
          v_layer.sub_container_id,
          v_bv.brand_variant_id,
          v_bv.item_name,
          NULLIF(v_bv.sku, ''),
          'cost_adjustment',
          v_layer.remaining_qty,
          v_per_unit_lc,
          'landed_cost',
          p_lc_id,
          v_layer.id,
          'LC ' || v_lc.lc_number || ': '
            || ROUND(v_per_unit_lc, 4) || ' ' || v_lc.currency
            || ' × ' || v_layer.remaining_qty || ' remaining units'
        );
      END LOOP;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);
      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;

    -- ── COGS side ───────────────────────────────────────────────────────────
    IF v_sold > 0 THEN
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
        qty, unit_cost, total_cost, date, notes, source_type
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units',
        'landed_cost'
      );
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET applied_at       = v_apply_time,
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = v_apply_time
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_landed_cost(uuid) TO authenticated;
