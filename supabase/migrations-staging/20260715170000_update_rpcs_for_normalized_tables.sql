-- ============================================================
-- Update all RPCs that referenced dropped JSONB columns
-- to use the new normalized line-item tables instead:
--   returns.items           → return_lines
--   sale_deliveries.items   → sale_delivery_lines
--   landed_costs.lines      → landed_cost_lines
--   landed_costs.item_allocations → landed_cost_item_allocations
-- ============================================================

-- ── 0. Add missing bill_path column to landed_cost_lines ────────────────────
-- The original migration missed this column which is used for bill attachments.

ALTER TABLE public.landed_cost_lines ADD COLUMN IF NOT EXISTS bill_path text;

-- Backfill bill_path from the original JSON data if it was stored
-- (The JSON column is already dropped, so this only applies if re-running.
--  For the live DB the column starts NULL which is correct — bills are
--  uploaded after creation via a separate update.)


-- ── 1. complete_delivery_inventory ──────────────────────────────────────────
-- Was reading v_delivery.items JSONB; now queries sale_delivery_lines table.

CREATE OR REPLACE FUNCTION complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery  RECORD;
  v_line      RECORD;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
  v_all_delivered BOOLEAN;
  v_any_delivered BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false);

    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;

    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date, source_type
    ) VALUES (
      v_line.brand_variant_id, p_delivery_id, p_so_id,
      v_line.qty_delivered, v_result.weighted_unit_cost, v_result.total_cost, v_date,
      'sale'
    );

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_line.brand_variant_id,
      COALESCE(v_line.item_name, ''),
      v_line.sku,
      'sale_delivery', -v_line.qty_delivered, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;

  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;


-- ── 2. cancel_delivery_inventory ────────────────────────────────────────────
-- Was reading v_delivery.items JSONB; now queries sale_delivery_lines table.

CREATE OR REPLACE FUNCTION cancel_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery  RECORD;
  v_cogs      RECORD;
  v_line      RECORD;
  v_wh_id     UUID;
BEGIN
  SELECT warehouse_id, date, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery % is already cancelled', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;

  UPDATE sale_deliveries
  SET    status = 'cancelled', updated_at = now()
  WHERE  id = p_delivery_id;

  IF v_delivery.status = 'delivered' THEN

    -- Reverse delivered_qty on SO lines
    FOR v_line IN
      SELECT brand_variant_id, item_name, qty_delivered
      FROM sale_delivery_lines
      WHERE sale_delivery_id = p_delivery_id
    LOOP
      CONTINUE WHEN v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

      IF v_line.brand_variant_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_line.brand_variant_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = v_line.item_name
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- Restore FIFO layers from cogs_entries
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    DELETE FROM cogs_entries WHERE sale_delivery_id = p_delivery_id;

    -- Revert SO status
    UPDATE sale_orders
    SET    status = CASE
             WHEN EXISTS (
               SELECT 1 FROM sale_order_lines
               WHERE sale_order_id = p_so_id AND COALESCE(delivered_qty, 0) > 0
             ) THEN 'partial_delivery'::sale_order_status
             ELSE 'confirmed'::sale_order_status
           END,
           updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('delivered', 'partial_delivery');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_inventory(UUID, UUID) TO authenticated;


-- ── 3. create_landed_cost ───────────────────────────────────────────────────
-- Was inserting p_lines into landed_costs.lines JSONB column;
-- now inserts into landed_cost_lines table.

DROP FUNCTION IF EXISTS public.create_landed_cost(text, date, text, jsonb, uuid[], uuid[]);

CREATE FUNCTION public.create_landed_cost(
  p_description text,
  p_date date,
  p_currency text,
  p_lines jsonb,
  p_attached_receival_ids uuid[],
  p_attached_po_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_id           UUID;
  v_line         JSONB;
BEGIN
  IF p_lines IS NULL THEN
    RAISE EXCEPTION 'p_lines must not be null';
  END IF;

  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE(NULLIF((line->>'exchange_rate')::NUMERIC, 0), 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  -- Insert each line into the normalized table
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO landed_cost_lines (
      landed_cost_id, description, amount, currency, exchange_rate, bill_path
    ) VALUES (
      v_id,
      COALESCE(TRIM(v_line->>'description'), ''),
      COALESCE((v_line->>'amount')::NUMERIC, 0),
      COALESCE(v_line->>'currency', p_currency),
      COALESCE((v_line->>'exchange_rate')::NUMERIC, 1),
      NULLIF(TRIM(v_line->>'bill_path'), '')
    );
  END LOOP;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_landed_cost(text, date, text, jsonb, uuid[], uuid[]) TO authenticated;


-- ── 4. allocate_landed_cost ─────────────────────────────────────────────────
-- Was writing v_allocations JSONB into landed_costs.item_allocations;
-- now inserts rows into landed_cost_item_allocations table.

DROP FUNCTION IF EXISTS public.allocate_landed_cost(uuid);

CREATE FUNCTION public.allocate_landed_cost(p_lc_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  -- Clear any existing allocations (idempotent re-apply)
  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                   AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0 END                         AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);

    WITH locked_layers AS (
      SELECT remaining_qty
        FROM fifo_cost_layers
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty    > 0
       FOR UPDATE
    )
    SELECT COALESCE(SUM(remaining_qty), 0)
      INTO v_bv_remaining
      FROM locked_layers;

    v_sold        := GREATEST(v_bv.qty_received - v_bv_remaining, 0);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

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

    -- Insert allocation row into normalized table
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

    -- Build JSON for return value (backward compat with callers expecting JSONB)
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
    IF v_bv_remaining > 0 THEN
      SELECT v_snapshot || COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'layer_id',          id::TEXT,
          'brand_variant_id',  brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ))
        FROM fifo_cost_layers
        WHERE brand_variant_id = v_bv.brand_variant_id
          AND remaining_qty    > 0),
        '[]'::JSONB
      )
      INTO v_snapshot;

      UPDATE fifo_cost_layers
         SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
             total_unit_cost      = total_unit_cost      + v_per_unit_lc
       WHERE brand_variant_id = v_bv.brand_variant_id
         AND remaining_qty    > 0;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);

      INSERT INTO inventory_stock_movements
        (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
         reference_type, reference_id, notes)
      VALUES
        (v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
         'cost_adjustment', v_bv_remaining, v_per_unit_lc,
         'landed_cost', p_lc_id,
         'LC ' || v_lc.lc_number || ': '
           || ROUND(v_inventory_portion, 2) || ' ' || v_lc.currency
           || ' over ' || v_bv_remaining || ' remaining units');

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

GRANT EXECUTE ON FUNCTION allocate_landed_cost(uuid) TO authenticated;


-- ── 5. revert_landed_cost ───────────────────────────────────────────────────
-- Was setting item_allocations = NULL; now DELETEs from landed_cost_item_allocations.

DROP FUNCTION IF EXISTS public.revert_landed_cost(uuid);
DROP FUNCTION IF EXISTS public.revert_landed_cost(uuid, text);

CREATE FUNCTION public.revert_landed_cost(p_lc_id uuid, p_performer_name text DEFAULT 'System'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
      AND unit_cost      > 0;
  END IF;

  -- ── COGS side: insert reversing rows ──────────────────────────────────────
  INSERT INTO cogs_entries (
    brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
    qty, unit_cost, total_cost, date, notes, source_type
  )
  SELECT
    brand_variant_id, NULL, NULL, p_lc_id,
    -qty, unit_cost, -total_cost, v_now::DATE,
    'Reversal of LC ' || v_lc.lc_number || ' — reverted by ' || p_performer_name,
    'landed_cost_reversal'
  FROM cogs_entries
  WHERE landed_cost_id = p_lc_id
    AND total_cost     > 0;

  -- ── Delete allocation rows from normalized table ──────────────────────────
  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  -- ── Reset the LC ──────────────────────────────────────────────────────────
  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_landed_cost(uuid, text) TO authenticated;


-- ── 6. rpc_process_po_return_dispatch ───────────────────────────────────────
-- Was reading v_return.items JSONB; now queries return_lines table.

CREATE OR REPLACE FUNCTION public.rpc_process_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return  RECORD;
  v_line    RECORD;
  v_bv_id   UUID;
  v_result  RECORD;
BEGIN
  SELECT id, restock_warehouse_id, status, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'dispatched' THEN
    RAISE EXCEPTION 'Return must have status=dispatched before processing inventory';
  END IF;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    -- Fallback: look up brand variant by SKU code when brand_variant_id is missing
    IF v_bv_id IS NULL AND v_line.sku IS NOT NULL AND TRIM(v_line.sku) != '' THEN
      SELECT id INTO v_bv_id
      FROM   inventory_brand_variants
      WHERE  code = TRIM(v_line.sku)
      LIMIT  1;
    END IF;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT total_cost, weighted_unit_cost
    INTO   v_result
    FROM   deduct_fifo_layers(v_bv_id, v_return.restock_warehouse_id, v_line.qty, false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_line.item_name,
      NULLIF(v_line.sku, ''),
      'purchase_return',
      -v_line.qty,
      v_result.weighted_unit_cost,
      'po_return',
      p_return_id,
      'Returned to supplier'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = now() WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_process_po_return_dispatch(uuid) TO authenticated;


-- ── 7. rpc_cancel_po_return_dispatch ────────────────────────────────────────
-- Was reading v_return.items JSONB; now queries return_lines table.

CREATE OR REPLACE FUNCTION public.rpc_cancel_po_return_dispatch(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return  RECORD;
  v_line    RECORD;
  v_bv_id   UUID;
BEGIN
  SELECT id, restock_warehouse_id, dispatched_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.dispatched_at IS NULL THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    v_bv_id := v_line.brand_variant_id;

    IF v_bv_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE inventory_brand_variants
    SET    stock_level = stock_level + v_line.qty
    WHERE  id = v_bv_id;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes
    ) VALUES (
      v_return.restock_warehouse_id,
      v_bv_id,
      v_line.item_name,
      NULLIF(v_line.sku, ''),
      'purchase_return_cancelled',
      v_line.qty,
      0,
      'po_return',
      p_return_id,
      'PO return cancelled — stock restored'
    );
  END LOOP;

  UPDATE returns SET dispatched_at = NULL WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_cancel_po_return_dispatch(uuid) TO authenticated;


-- ── 8. rpc_process_return_restock ───────────────────────────────────────────
-- Was reading v_return.items JSONB; now queries return_lines table.

CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return   RECORD;
  v_line     RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, restock_warehouse_id, status, restocked_at
  INTO   v_return
  FROM   returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status != 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory';
  END IF;

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty, condition
    FROM return_lines
    WHERE return_id = p_return_id
  LOOP
    IF v_line.brand_variant_id IS NULL OR v_line.qty <= 0 THEN
      CONTINUE;
    END IF;

    IF LOWER(COALESCE(v_line.condition, '')) = 'good' THEN
      SELECT COALESCE(average_cost, 0) INTO v_avg_cost
      FROM   inventory_brand_variants
      WHERE  id = v_line.brand_variant_id;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type
      ) VALUES (
        v_line.brand_variant_id, v_return.restock_warehouse_id, CURRENT_DATE,
        v_line.qty, v_avg_cost, 0, v_avg_cost, v_line.qty,
        'sale_return'
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_line.qty,
             updated_at  = now()
      WHERE  id = v_line.brand_variant_id;

      PERFORM recalc_average_cost(v_line.brand_variant_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_line.brand_variant_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'sale_return',
        v_line.qty,
        v_avg_cost,
        'return',
        p_return_id,
        'Restocked from sale return'
      );

    ELSIF LOWER(COALESCE(v_line.condition, '')) = 'damaged' THEN
      UPDATE inventory_brand_variants
      SET    damaged_qty = damaged_qty + v_line.qty
      WHERE  id = v_line.brand_variant_id;

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        v_return.restock_warehouse_id,
        v_line.brand_variant_id,
        v_line.item_name,
        NULLIF(v_line.sku, ''),
        'sale_return_damaged',
        v_line.qty,
        0,
        'return',
        p_return_id,
        'Damaged item from sale return — awaiting assessment'
      );
    END IF;
  END LOOP;

  UPDATE returns SET restocked_at = now() WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_process_return_restock(uuid) TO authenticated;


-- ── 9. Drop dead approve_warehouse_transfer_inventory function ──────────────
-- This old function still reads warehouse_transfers.items JSONB which was
-- already replaced by warehouse_transfer_items table. No app code calls it.

DROP FUNCTION IF EXISTS public.approve_warehouse_transfer_inventory(uuid, text);
