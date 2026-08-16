-- Money-Path Fix: allocate_landed_cost value base must be in QAR.
--
-- Background (see 20260729214710_fx_receival_qar_conversion.sql):
--   receival_items.unit_cost is stored in the PO's ORIGINAL currency (USD/EUR/…),
--   NOT QAR. The FIFO layer gets unit_cost * initial_exchange_rate (QAR); the
--   receival_items row keeps the as-entered PO-currency value for audit.
--
-- Two defects this fixes (both foreign-currency-only; QAR POs have rate=1 and
-- are byte-for-byte unaffected):
--
--   #1 Value-share base mixed currencies. v_grand_total and each variant's
--      total_value were SUM(qty_received * receival_items.unit_cost) in raw PO
--      currency. The share is a ratio, so a SINGLE-currency LC is fine (the
--      rate cancels). But when one LC attaches receivals from POs in DIFFERENT
--      currencies (e.g. LC-2026-0004 = QAR + USD), the ratio treats 100 USD as
--      equal value to 100 QAR and mis-splits the (QAR) landed cost. Fix: convert
--      each item to QAR (× the PO's initial_exchange_rate) BEFORE summing, so the
--      ratio is single-currency and correct across mixed-currency LCs.
--
--   #2 Audit columns were a mixed-currency sum. original_unit_cost was the avg of
--      receival_items.unit_cost (PO currency); updated_unit_cost = original +
--      lc_per_unit added a QAR-denominated lc_per_unit to a PO-currency original —
--      nonsense for foreign POs. The LC detail dialog renders both with
--      lc.currency (always QAR), so original was mislabeled and updated was
--      arithmetic garbage. Converting the value base to QAR makes avg_unit_cost
--      (→ original_unit_cost) QAR and updated_unit_cost = QAR + QAR coherent, so
--      the existing QAR label is now truthful with NO UI change.
--
-- What is NOT changed (already correct — all QAR):
--   * v_lc.total_amount / v_lc.currency are QAR.
--   * lc_per_unit = QAR total × dimensionless ratio → QAR (unchanged).
--   * fifo_cost_layers.landed_cost_per_unit/total_unit_cost += lc_per_unit (QAR).
--   * cogs_entries and the cost_adjustment inventory_stock_movements rows (QAR).
--   * The receival_id-based FIFO scope (C5 hotfix 20260815004600) is preserved
--     verbatim, so INV-source receivals (po_id NULL → rate 1) keep working.
--
-- Rate source: purchase_orders.initial_exchange_rate — the SAME value
-- create_and_approve_receival used to build the QAR FIFO cost. Verified on live
-- rows that ri.unit_cost * po.initial_exchange_rate reproduces fifo layer QAR
-- unit_cost exactly (e.g. RCV-00025: 350 USD × 3.65 = 1277.50 QAR). The column
-- is mutation-controlled (no post-receival drift) and NOT NULL for real POs;
-- COALESCE(...,1) covers inventory receivals (po_id NULL, costs already QAR).
--
-- No historical backfill: the only applied LC (LC-2026-0003) is QAR-only, so its
-- stored allocation rows are already correct. This affects future applies only;
-- LC-2026-0004 (unapplied, mixed) will allocate correctly when applied.
--
-- Source body: 20260815004600_c5_hotfix_scope_by_receival_id.sql (== live
-- pg_get_functiondef at time of writing). Preserved verbatim except the two
-- aggregate SELECTs (v_grand_total and the v_bv loop) now multiply
-- receival_items.unit_cost by COALESCE(po.initial_exchange_rate, 1) and LEFT JOIN
-- purchase_orders.

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

  -- QAR value base (#1/#2 fix): convert each item to QAR at its PO's booked rate
  -- before summing. COALESCE(...,1) handles inventory receivals (po_id NULL).
  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1)), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
    LEFT JOIN purchase_orders po ON po.id = rv.po_id
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                    AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      -- total_value + avg_unit_cost in QAR (× PO booked rate per item).
      SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1))  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost * COALESCE(po.initial_exchange_rate, 1)) / SUM(ri.qty_received)
        ELSE 0 END                          AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
    LEFT JOIN purchase_orders po ON po.id = rv.po_id
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

    -- C5 scope (hotfix): use receival_id instead of source_id. receival_id
    -- is always populated for source_type='receival' layers; source_id was
    -- not stamped by the receival RPCs and only backfilled once (2026-07-26).
    SELECT COALESCE(SUM(fcl.remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers fcl
     WHERE fcl.brand_variant_id = v_bv.brand_variant_id
       AND fcl.remaining_qty    > 0
       AND fcl.source_type      = 'receival'
       AND fcl.receival_id      = ANY(v_lc.attached_receival_ids);

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

    IF v_bv_remaining > 0 AND COALESCE(v_per_unit_lc, 0) <> 0 THEN
      FOR v_layer IN
        SELECT fcl.id, fcl.warehouse_id, fcl.sub_container_id, fcl.remaining_qty
          FROM fifo_cost_layers fcl
         WHERE fcl.brand_variant_id = v_bv.brand_variant_id
           AND fcl.remaining_qty    > 0
           AND fcl.source_type      = 'receival'
           AND fcl.receival_id      = ANY(v_lc.attached_receival_ids)
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

NOTIFY pgrst, 'reload schema';
