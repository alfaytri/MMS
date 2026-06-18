-- supabase/migrations/20260425000066_rpc_apply_receival_edit.sql
BEGIN;

CREATE OR REPLACE FUNCTION apply_receival_edit(
  p_edit_request_id UUID,
  p_items           JSONB  -- [{receival_item_id, new_qty, new_unit_cost}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req             RECORD;
  v_receival        RECORD;
  v_item_input      JSONB;
  v_ri              RECORD;
  v_bv_id           UUID;
  v_old_qty         INT;
  v_new_qty         INT;
  v_old_cost        NUMERIC;
  v_new_cost        NUMERIC;
  v_delta           INT;
  v_layer_remaining BIGINT;
  v_sold_qty        BIGINT;
  v_has_applied_lc  BOOLEAN;   -- Fix 3: replaces v_lc_count INT
  v_lc_rec          RECORD;
  v_total_remaining BIGINT;
  v_receival_date   DATE;
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
  -- Fix 1: guard NOT FOUND after receival lock
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

  -- ── 3. Pre-flight LC check (Fix 3) ─────────────────────────────────────────
  -- Acquire shared lock on any applied LCs that reference this receival.
  -- This prevents a concurrent allocate_landed_cost from slipping past while we edit.
  PERFORM 1 FROM landed_costs
  WHERE v_req.receival_id = ANY(attached_receival_ids)
    AND applied_at IS NOT NULL AND voided_at IS NULL
  FOR SHARE;

  -- Compute once whether any applied LC references this receival.
  SELECT EXISTS(
    SELECT 1 FROM landed_costs
    WHERE v_req.receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) INTO v_has_applied_lc;

  -- ── 4. Process each item ────────────────────────────────────────────────────
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    -- Fix 6: validate receival_item ownership in the same query
    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id
    INTO v_old_qty, v_old_cost, v_bv_id
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

    -- Fix 5: input validation on new_qty and new_unit_cost
    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'new_qty must be a positive integer for item %', v_item_input->>'receival_item_id';
    END IF;
    IF v_new_cost IS NULL OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'new_unit_cost must be non-negative for item %', v_item_input->>'receival_item_id';
    END IF;

    -- Skip non-inventory items
    CONTINUE WHEN v_bv_id IS NULL;

    -- ── QTY CHANGE ────────────────────────────────────────────────────────────
    IF v_delta <> 0 THEN
      -- Fix 3: use pre-computed boolean instead of repeated COUNT query
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        UPDATE fifo_cost_layers
        SET qty           = qty           + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id::TEXT
          AND brand_variant_id = v_bv_id;

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
        -- Fix 4: ORDER BY id ASC to prevent deadlocks on concurrent row locking
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM (
          SELECT remaining_qty FROM fifo_cost_layers
          WHERE receival_id = v_req.receival_id::TEXT
            AND brand_variant_id = v_bv_id
          ORDER BY id ASC
          FOR UPDATE
        ) sub;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        -- Fix 7: update both qty and remaining_qty on decrease
        UPDATE fifo_cost_layers
        SET qty           = qty           - ABS(v_delta),
            remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id::TEXT
          AND brand_variant_id = v_bv_id;

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
      -- Fix 3: use pre-computed boolean instead of repeated COUNT query
      IF v_has_applied_lc THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      -- Determine how many units from this receival have already been sold
      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        -- NOTE: COGS attribution uses unit_cost + date as a proxy for FIFO layer identity.
        -- This may mis-attribute entries if another receival for the same variant shares the
        -- same unit_cost. A schema-level fix (receival_id on cogs_entries) would be required
        -- for exact attribution. Acceptable limitation for current schema.
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

      -- Update FIFO layer cost
      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost,
          total_unit_cost = v_new_cost + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;
    END IF;

    -- Recalc average_cost after all changes for this variant
    PERFORM recalc_average_cost(v_bv_id);

    -- All-sold detection for pending LCs after qty decrease (Fix 2: correct cast)
    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids
        FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        -- Fix 2: cast UUID array elements to TEXT for comparison with receival_id (TEXT)
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id = ANY(
          SELECT unnest(v_lc_rec.attached_receival_ids)::TEXT
        );

        IF v_total_remaining = 0 THEN
          UPDATE landed_costs
          SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    -- Persist new values on receival_item
    UPDATE receival_items
    SET qty_received = v_new_qty,
        unit_cost    = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;

  END LOOP;

  -- ── 5. Close the edit token ─────────────────────────────────────────────────
  UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true, 'edit_request_id', p_edit_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_receival_edit(UUID, JSONB) TO authenticated;

COMMIT;
