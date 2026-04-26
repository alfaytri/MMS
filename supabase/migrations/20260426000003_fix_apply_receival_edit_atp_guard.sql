-- supabase/migrations/20260426000003_fix_apply_receival_edit_atp_guard.sql
--
-- RISK: apply_receival_edit allows qty decreases that would drop stock_level
-- below reserved_qty, producing negative available (ATP) stock.
--
-- FIX: after the FIFO layer remaining_qty guard, add a second check that
-- (current stock_level - |delta|) >= reserved_qty before committing.

BEGIN;

CREATE OR REPLACE FUNCTION apply_receival_edit(
  p_edit_request_id UUID,
  p_items           JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_bv_id           UUID;
  v_pli_id          UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;
  v_new_cost        NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
  v_stock_level     INT;      -- NEW
  v_reserved_qty    INT;      -- NEW
BEGIN
  -- ── 1. Lock and validate the edit request ──────────────────────────────────
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

  -- ── 2. Lock the receival ────────────────────────────────────────────────────
  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  -- ── 3. Pre-flight LC check ──────────────────────────────────────────────────
  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  -- ── 4. Process each item ────────────────────────────────────────────────────
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id, ri.po_line_item_id
    INTO v_old_qty, v_old_cost, v_bv_id, v_pli_id
    FROM receival_items ri
    WHERE ri.id = (v_item_input->>'receival_item_id')::UUID
      AND ri.receival_id = v_req.receival_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found (or does not belong to receival %)',
        v_item_input->>'receival_item_id', v_req.receival_id;
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

    -- Sync PO line item received_qty (always, regardless of inventory linkage)
    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- ── QTY CHANGE ────────────────────────────────────────────────────────────
    IF v_delta <> 0 THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;

      ELSE  -- v_delta < 0
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id
          ORDER BY id ASC FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        -- ATP guard: new stock_level must not fall below reserved_qty
        SELECT stock_level, COALESCE(reserved_qty, 0)
        INTO v_stock_level, v_reserved_qty
        FROM inventory_brand_variants
        WHERE id = v_bv_id;

        IF (v_stock_level - ABS(v_delta)) < v_reserved_qty THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: new stock level (%) would be below reserved qty (%)',
            ABS(v_delta),
            v_stock_level - ABS(v_delta),
            v_reserved_qty;
        END IF;

        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    -- ── UNIT COST CHANGE ──────────────────────────────────────────────────────
    IF v_new_cost <> v_old_cost THEN
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost,
            total_cost = v_new_cost * qty
        WHERE id IN (
          SELECT id FROM cogs_entries
          WHERE brand_variant_id = v_bv_id
            AND unit_cost = v_old_cost
            AND date >= v_receival_date
          ORDER BY date ASC
          LIMIT v_sold_qty
        );
      END IF;

      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost,
          total_unit_cost = v_new_cost + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;
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
        WHERE fcl.receival_id = ANY(
          SELECT unnest(v_lc_rec.attached_receival_ids)::TEXT
        );
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

  UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true, 'edit_request_id', p_edit_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_receival_edit(UUID, JSONB) TO authenticated;

COMMIT;
