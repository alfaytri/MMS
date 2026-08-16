-- Landed-cost COGS → P&L: make retroactive LC adjustments hit reported margin.
--
-- ⚠️ COORDINATION: this migration's allocate_landed_cost body is a MERGE of two
-- concurrent money-path changes on the same function:
--   * 20260816100000_lc_allocation_qar_value_base.sql (foreign-currency task) —
--     the QAR value base (× PO initial_exchange_rate) in v_grand_total + the v_bv
--     loop. Reproduced verbatim here.
--   * THIS change — stamp division_id + source_id on the landed_cost COGS row.
-- The two edits are orthogonal (value-base aggregation vs COGS-insert columns).
-- Both files are CREATE OR REPLACE; this one is timestamped later, so applying
-- both leaves the DB with this merged superset. DO NOT apply until the
-- foreign-currency task's allocate body is final — re-verify it matches the
-- block reproduced here, then apply.
--
-- Problem: when a landed cost is applied to units that were ALREADY sold, the
-- LC's share for those units posts to cogs_entries as source_type='landed_cost'
-- (and 'landed_cost_reversal' on revert). Those rows were never stamped with a
-- division_id / source_id, so rpc_report_pnl — which scopes COGS by division
-- (COALESCE(consumer_division_id, division_id)) and warehouse (source_id → FIFO
-- layer) and filtered source_type IN ('sale','sale_return') — could neither
-- include nor scope them. Result: the "margin corrected downward" the LC help
-- text promises was recorded on the LC + Stock-Value COGS but NOT reflected in
-- the P&L.
--
-- Fix (3 parts, all money-path):
--   1. allocate_landed_cost — stamp division_id + source_id on the landed_cost
--      COGS row. Division = the sub-container division of the LC's receival
--      layers for that variant (i.e. where the goods were received/valued);
--      source_id = a representative layer so the P&L can warehouse-scope it.
--      Sold-out layers still exist (remaining_qty may be 0), so this resolves
--      even when nothing remains in stock.
--   2. revert_landed_cost — its reversal COGS is an INSERT…SELECT from the
--      original rows, so it now copies division_id + source_id across (the
--      reversal nets the original out in the same division bucket).
--   3. rpc_report_pnl — include 'landed_cost' + 'landed_cost_reversal' in the
--      accrual COGS. These rows carry no revenue (sale_order_id IS NULL → 0),
--      so they only raise COGS / lower margin, in their product stream.
--   + one-time backfill of existing landed_cost / landed_cost_reversal rows.
--
-- Attribution note: LC-COGS is attributed to the RECEIVAL (owning) division.
-- For the normal case (received and sold in the same division) that equals the
-- selling division. A unit received in one division and sold by another after a
-- transfer is an accepted approximation (the LC is a purchase-side cost).
--
-- Bodies sourced byte-faithfully from the live DB via pg_get_functiondef
-- (allocate = C5 receival_id-scoped variant; revert; pnl) with only the edits
-- above. CREATE OR REPLACE preserves existing grants/ACLs.

BEGIN;

-- ── 1. allocate_landed_cost — stamp division_id + source_id on LC-COGS ────────
CREATE OR REPLACE FUNCTION public.allocate_landed_cost(p_lc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_rep_layer_id      UUID;
  v_rep_division_id   UUID;
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

  -- QAR value base (merged from 20260816000000/20260816100000 lc_allocation_qar_value_base):
  -- convert each item to QAR at its PO's booked rate before summing so a
  -- mixed-currency LC splits correctly. COALESCE(...,1) covers inventory
  -- receivals (po_id NULL, costs already QAR).
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
      -- Attribute the retroactive LC-COGS to the division where the goods were
      -- received (sub-container division of this variant's LC receival layers)
      -- and point source_id at a representative layer, so rpc_report_pnl can
      -- division/warehouse-scope it. Sold-out layers still exist (remaining_qty
      -- may be 0), so this resolves even when nothing remains in stock.
      SELECT fcl.id, wsc.division_id
        INTO v_rep_layer_id, v_rep_division_id
        FROM fifo_cost_layers fcl
        LEFT JOIN warehouse_sub_containers wsc ON wsc.id = fcl.sub_container_id
       WHERE fcl.brand_variant_id = v_bv.brand_variant_id
         AND fcl.source_type      = 'receival'
         AND fcl.receival_id      = ANY(v_lc.attached_receival_ids)
       ORDER BY fcl.qty DESC NULLS LAST
       LIMIT 1;

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
        qty, unit_cost, total_cost, date, notes, source_type,
        division_id, source_id
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units',
        'landed_cost',
        v_rep_division_id, v_rep_layer_id
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
$function$;

-- ── 2. revert_landed_cost — carry division_id + source_id into the reversal ───
CREATE OR REPLACE FUNCTION public.revert_landed_cost(p_lc_id uuid, p_performer_name text DEFAULT 'System'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    INSERT INTO inventory_stock_movements
      (warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
       movement_type, qty, unit_cost, reference_type, reference_id, notes)
    SELECT
      warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
      'cost_adjustment', qty, -unit_cost, 'landed_cost', p_lc_id,
      'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name
    FROM inventory_stock_movements
    WHERE reference_type = 'landed_cost'
      AND reference_id   = p_lc_id
      AND movement_type  = 'cost_adjustment'
      AND unit_cost      > 0;
  END IF;

  INSERT INTO cogs_entries (
    brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
    qty, unit_cost, total_cost, date, notes, source_type,
    division_id, source_id
  )
  SELECT
    brand_variant_id, NULL, NULL, p_lc_id,
    -qty, unit_cost, -total_cost, v_now::DATE,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name,
    'landed_cost_reversal',
    division_id, source_id
  FROM cogs_entries
  WHERE landed_cost_id = p_lc_id
    AND total_cost     > 0;

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$function$;

-- ── 3. Backfill existing LC-COGS rows (division + representative layer) ────────
-- Idempotent: only touches rows still missing division_id. Derives the same way
-- allocate now does — the largest receival layer of that variant for the LC.
UPDATE cogs_entries ce
   SET division_id = sub.division_id,
       source_id   = sub.layer_id
  FROM (
    SELECT DISTINCT ON (ce2.id)
      ce2.id          AS cogs_id,
      fcl.id          AS layer_id,
      wsc.division_id AS division_id
    FROM cogs_entries ce2
    JOIN landed_costs lc      ON lc.id = ce2.landed_cost_id
    JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = ce2.brand_variant_id
                             AND fcl.source_type      = 'receival'
                             AND fcl.receival_id      = ANY(lc.attached_receival_ids)
    LEFT JOIN warehouse_sub_containers wsc ON wsc.id = fcl.sub_container_id
    WHERE ce2.source_type IN ('landed_cost', 'landed_cost_reversal')
    ORDER BY ce2.id, fcl.qty DESC NULLS LAST
  ) sub
 WHERE ce.id = sub.cogs_id
   AND ce.division_id IS NULL;

-- ── 4. rpc_report_pnl — include LC-COGS (+ reversals) in accrual COGS ─────────
CREATE OR REPLACE FUNCTION public.rpc_report_pnl(p_start date, p_end date, p_basis text DEFAULT 'accrual'::text, p_division_ids uuid[] DEFAULT NULL::uuid[], p_warehouse_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_fx     numeric;
  v_scrap  numeric;
BEGIN
  -- Realized FX from payments settled in the period (both bases). Purchase
  -- payments on a multi-division PO are split by line-value weight; everything
  -- else is attributed to its header division.
  WITH fx_raw AS (
    SELECT
      (COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0)) AS fx,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
      COALESCE(po.id, bl.purchase_order_id) AS po_id
    FROM public.payments p
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    WHERE p.deleted_at IS NULL
      AND p.date BETWEEN p_start AND p_end
  ),
  fx_attr AS (
    -- Purchase payment on a PO with per-division weights → split.
    SELECT w.division_id AS div, fr.fx * w.weight AS fx
    FROM fx_raw fr
    CROSS JOIN LATERAL public._po_division_weights(fr.po_id) w
    UNION ALL
    -- Everything else → header division.
    SELECT fr.hdr_div AS div, fr.fx
    FROM fx_raw fr
    WHERE NOT EXISTS (SELECT 1 FROM public._po_division_weights(fr.po_id))
  )
  SELECT COALESCE(SUM(fx), 0)
    INTO v_fx
  FROM fx_attr
  WHERE public.is_division_visible(div)
    AND (p_division_ids IS NULL OR div = ANY(p_division_ids));

  -- Scrap & Defective — canonical write-offs only (approved SA adjustment_type='write_off'),
  -- valued at the cost booked to the movement each produced. Both good and damaged
  -- write-offs are now division + warehouse scoped.
  SELECT
    COALESCE((
      -- Good-pile write-offs: division + warehouse scoped via sub_container -> division.
      SELECT SUM(ABS(sm.qty) * sm.unit_cost)
      FROM public.inventory_stock_movements sm
      JOIN public.stock_adjustments sa ON sa.id = sm.reference_id
      LEFT JOIN public.warehouse_sub_containers wsc ON wsc.id = sm.sub_container_id
      WHERE sm.movement_type::text  = 'adjustment'
        AND sm.reference_type       = 'adjustment'
        AND sa.adjustment_type::text = 'write_off'
        AND sa.status::text          = 'approved'
        AND sm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(wsc.division_id)
        AND (p_division_ids  IS NULL OR wsc.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR sm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
    +
    COALESCE((
      -- Damaged-pile write-offs: division-scoped via the movement's division_id
      -- (stamped from the source sub-container / return at damage time).
      SELECT SUM(dm.qty * dm.unit_cost)
      FROM public.inventory_damaged_movements dm
      WHERE dm.movement_type = 'damaged_write_off'
        AND dm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(dm.division_id)
        AND (p_division_ids  IS NULL OR dm.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR dm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
  INTO v_scrap;

  IF p_basis = 'cash' THEN
    WITH pay_raw AS (
      SELECT
        p.direction,
        COALESCE(p.amount_qar, 0) AS amt,
        COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
        COALESCE(po.id, bl.purchase_order_id) AS po_id
      FROM public.payments p
      LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
      LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
      LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
      LEFT JOIN public.bills bl           ON bl.id = p.bill_id
      WHERE p.deleted_at IS NULL
        AND p.status::text IN ('completed', 'pending', 'processing')
        AND p.date BETWEEN p_start AND p_end
    ),
    pay AS (
      -- Outgoing (purchase) payment on a weighted PO → split by division.
      SELECT pr.direction, w.division_id AS div, pr.amt * w.weight AS amt
      FROM pay_raw pr
      CROSS JOIN LATERAL public._po_division_weights(pr.po_id) w
      WHERE pr.direction = 'outgoing'
      UNION ALL
      -- Incoming payments, and outgoing payments without a weighted PO → header division.
      SELECT pr.direction, pr.hdr_div AS div, pr.amt
      FROM pay_raw pr
      WHERE pr.direction <> 'outgoing'
         OR NOT EXISTS (SELECT 1 FROM public._po_division_weights(pr.po_id))
    ),
    pay_vis AS (
      SELECT direction, amt
      FROM pay
      WHERE public.is_division_visible(div)
        AND (p_division_ids IS NULL OR div = ANY(p_division_ids))
    )
    SELECT jsonb_build_object(
      'basis',    'cash',
      'cash_in',  (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'incoming'),
      'cash_out', (SELECT COALESCE(SUM(amt), 0) FROM pay_vis WHERE direction = 'outgoing'),
      'fx_net',   v_fx,
      'scrap',    v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'cash_in')::numeric - (v_result->>'cash_out')::numeric + v_fx - v_scrap
    );
  ELSE
    WITH lines AS (
      SELECT
        initcap(replace(COALESCE(c.type::text, 'other'), '-', ' ')) AS stream,
        (ce.qty * COALESCE(sol.unit_price, 0) * COALESCE(so.exchange_rate, 1)) AS revenue,
        ce.total_cost AS cogs
      FROM public.cogs_entries ce
      JOIN public.inventory_item_brand_variants v ON v.id = ce.brand_variant_id
      JOIN public.inventory_items it ON it.id = v.item_id
      LEFT JOIN public.inventory_categories c ON c.id = it.category_id
      LEFT JOIN public.sale_orders so ON so.id = ce.sale_order_id
      LEFT JOIN LATERAL (
        SELECT sol2.unit_price FROM public.sale_order_lines sol2
        WHERE sol2.sale_order_id = ce.sale_order_id AND sol2.brand_variant_id = ce.brand_variant_id
        LIMIT 1
      ) sol ON true
      LEFT JOIN public.fifo_cost_layers fl ON fl.id = ce.source_id
      WHERE ce.source_type IN ('sale', 'sale_return', 'landed_cost', 'landed_cost_reversal')
        AND ce.date BETWEEN p_start AND p_end
        AND public.is_division_visible(COALESCE(ce.consumer_division_id, ce.division_id))
        AND (p_division_ids IS NULL OR COALESCE(ce.consumer_division_id, ce.division_id) = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR fl.warehouse_id = ANY(p_warehouse_ids))
    ),
    by_stream AS (
      SELECT stream, SUM(revenue) AS revenue, SUM(cogs) AS cogs
      FROM lines GROUP BY stream
    )
    SELECT jsonb_build_object(
      'basis',         'accrual',
      'revenue',       COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(revenue, 2)) ORDER BY stream) FROM by_stream), '[]'::jsonb),
      'cogs',          COALESCE((SELECT jsonb_agg(jsonb_build_object('stream', stream, 'amount', round(cogs, 2))    ORDER BY stream) FROM by_stream), '[]'::jsonb),
      'revenue_total', COALESCE((SELECT SUM(revenue) FROM by_stream), 0),
      'cogs_total',    COALESCE((SELECT SUM(cogs) FROM by_stream), 0),
      'fx_net',        v_fx,
      'scrap',         v_scrap
    ) INTO v_result;
    v_result := v_result || jsonb_build_object(
      'gross_profit',
        (v_result->>'revenue_total')::numeric - (v_result->>'cogs_total')::numeric + v_fx - v_scrap
    );
  END IF;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
