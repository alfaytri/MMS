-- Money-Path Fixes C6 + C7 + H9: apply_receival_edit rewrite.
--
-- Three separate bugs, one function:
--   C6  Qty branch inserted into inventory_stock_movements without
--       sub_container_id or warehouse_id — sub_container_id has been NOT NULL
--       since 2026-08-03 so every approved qty edit raised the NOT NULL
--       violation and rolled back.
--   C7  Cost branch wrote v_new_cost (raw PO currency) into
--       fifo_cost_layers.unit_cost / cogs_entries.unit_cost — both columns
--       have been QAR since 2026-07-29 (× receival's booked rate). Result:
--       any non-QAR PO with an approved cost edit under-costed layers by
--       roughly (fx_rate − 1) × qty.
--   H9  Cost branch matched cogs_entries to rewrite by
--       WHERE brand_variant_id = X AND unit_cost = old AND date >= receival
--       — unscoped. Same variant received twice at same cost meant editing
--       one receival rewrote COGS attributed to the other. Now scoped via
--       cogs_entries.source_id ∈ (fifo_cost_layers of this receival + bv).
--
-- Also derives warehouse_id + sub_container_id from receivals + receival_items
-- so both ISM inserts (qty-up + qty-down branches) satisfy NOT NULL.

CREATE OR REPLACE FUNCTION public.apply_receival_edit(p_edit_request_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_bv_id           UUID;
  v_pli_id          UUID;
  v_ri_sub          UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;   -- PO currency
  v_new_cost        NUMERIC;   -- PO currency
  v_new_cost_qar    NUMERIC;
  v_old_cost_qar    NUMERIC;
  v_fx_rate         NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
  v_stock_level     INT;
  v_reserved_qty    INT;
BEGIN
  SELECT * INTO v_req FROM receival_edit_requests WHERE id = p_edit_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit request % not found', p_edit_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Edit request % is not approved (status: %)', p_edit_request_id, v_req.status;
  END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
    UPDATE receival_edit_requests SET status = 'expired' WHERE id = p_edit_request_id;
    RAISE EXCEPTION 'Edit window expired. Please request a new edit.';
  END IF;

  -- Load receival header including warehouse (needed for ISM inserts).
  SELECT id, date, warehouse_id, po_id
  INTO   v_receival
  FROM   receivals WHERE id = v_req.receival_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  IF v_receival.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Receival % has no warehouse_id; cannot stamp movement rows.', v_req.receival_id;
  END IF;

  -- Load PO's booked rate to convert cost edits into QAR.
  SELECT COALESCE(initial_exchange_rate, exchange_rate, 1)
  INTO   v_fx_rate
  FROM   purchase_orders
  WHERE  id = v_receival.po_id;
  v_fx_rate := COALESCE(v_fx_rate, 1);

  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id, ri.po_line_item_id, ri.sub_container_id
    INTO   v_old_qty, v_old_cost, v_bv_id, v_pli_id, v_ri_sub
    FROM   receival_items ri
    WHERE  ri.id = (v_item_input->>'receival_item_id')::UUID
      AND  ri.receival_id = v_req.receival_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found (or does not belong to receival %)',
        v_item_input->>'receival_item_id', v_req.receival_id;
    END IF;

    IF v_ri_sub IS NULL THEN
      RAISE EXCEPTION 'receival_item % has no sub_container_id; cannot stamp movement rows.',
        v_item_input->>'receival_item_id';
    END IF;

    v_new_qty  := (v_item_input->>'new_qty')::INT;
    v_new_cost := (v_item_input->>'new_unit_cost')::NUMERIC;
    v_delta    := v_new_qty - v_old_qty;

    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'new_qty must be a positive integer for item %', v_item_input->>'receival_item_id';
    END IF;
    IF v_new_cost IS NULL OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'new_unit_cost must be non-negative for item %', v_item_input->>'receival_item_id';
    END IF;

    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- Precompute QAR-converted costs for FIFO / COGS writes (C7).
    v_new_cost_qar := v_new_cost * v_fx_rate;
    v_old_cost_qar := v_old_cost * v_fx_rate;

    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        -- C6: stamp warehouse_id + sub_container_id from the receival.
        INSERT INTO inventory_stock_movements
          (warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
           movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_receival.warehouse_id, v_ri_sub, v_bv_id, ii.name_en, ibv.code,
               'receival_edit', v_delta, v_old_cost_qar,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;

      ELSE
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        SELECT COALESCE(stock_level, 0), COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_item_brand_variants
        WHERE id = v_bv_id
        FOR UPDATE;

        IF (v_stock_level - ABS(v_delta)) < v_reserved_qty THEN
          RAISE EXCEPTION
            'Cannot reduce qty by % for variant %: new stock level (%) would be below reserved qty (%)',
            ABS(v_delta), v_bv_id,
            v_stock_level - ABS(v_delta),
            v_reserved_qty;
        END IF;

        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

        UPDATE inventory_item_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        -- C6: stamp warehouse_id + sub_container_id from the receival.
        INSERT INTO inventory_stock_movements
          (warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
           movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_receival.warehouse_id, v_ri_sub, v_bv_id, ii.name_en, ibv.code,
               'receival_edit', -ABS(v_delta), v_old_cost_qar,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_item_brand_variants ibv
        JOIN inventory_items ii ON ii.id = ibv.item_id
        WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      -- H9: rewrite COGS scoped by source_id (this receival's FIFO layers).
      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost_qar,
            total_cost = v_new_cost_qar * qty
        WHERE brand_variant_id = v_bv_id
          AND source_id IN (
            SELECT id FROM fifo_cost_layers
            WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id
          );
      END IF;

      -- C7: write QAR value into fifo_cost_layers.unit_cost (was PO currency).
      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost_qar,
          total_unit_cost = v_new_cost_qar + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;
    END IF;

    PERFORM recalc_average_cost(v_bv_id);

    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id = ANY(v_lc_rec.attached_receival_ids);
        IF v_total_remaining = 0 THEN
          UPDATE landed_costs SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    UPDATE receival_items
    SET qty_received = v_new_qty, unit_cost = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;
  END LOOP;

  UPDATE receival_edit_requests
  SET status = 'completed'
  WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_receival_edit(uuid, jsonb) TO authenticated;
