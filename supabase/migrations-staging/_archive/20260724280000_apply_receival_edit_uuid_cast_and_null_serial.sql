-- Follow-up to 20260724270000:
--   1. apply_receival_edit still casts v_req.receival_id::TEXT when
--      querying/updating fifo_cost_layers — now that receival_id is uuid,
--      those 5 casts fail. Drop them.
--   2. Also fix the unnest()::TEXT cast in the LC sweep (line 214) — that
--      one compares uuid array to text expression.
--   3. Change the tool-unit auto-create trigger: leave serial_number NULL
--      + is_placeholder = true, so users can enter real serials in the UI
--      (or click a subtle "Auto-generate" link if they want ordinals).
--      This matches the requested UX: entry-first, auto-gen as escape hatch.
--   4. approve_receival_inventory (baseline) already writes p_receival_id
--      directly — no cast needed, no rewrite required.

BEGIN;

-- ─── 1. Rewrite apply_receival_edit — drop the 6 wrong casts ────────────

CREATE OR REPLACE FUNCTION public.apply_receival_edit(p_edit_request_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', v_req.receival_id;
  END IF;
  v_receival_date := v_receival.date;

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

    IF v_delta <> 0 AND v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = GREATEST(0, received_qty + v_delta)
      WHERE id = v_pli_id;
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

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

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', v_delta, v_old_cost,
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

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ii.name_en, ii.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
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

      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id AND brand_variant_id = v_bv_id;

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

-- ─── 2. Trigger: insert placeholder units with NULL serial ──────────────
-- New UX: default is manual serial entry (empty rows disabled until
-- confirmed). A subtle "Auto-generate" link in the master-data UI can
-- fill them in via a separate RPC (Phase 2). This keeps auto-gen as an
-- escape hatch instead of the default.

CREATE OR REPLACE FUNCTION public.create_tool_units_on_receival_layer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id     uuid;
  v_category    text;
  v_ri_id       uuid;
  v_qty         int := COALESCE(NEW.qty, 0)::int;
  v_receival_id uuid;
  i             int;
BEGIN
  IF NEW.source_type <> 'receival' THEN RETURN NEW; END IF;
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  SELECT ii.id, ic.type::text
    INTO v_item_id, v_category
  FROM inventory_item_brand_variants biv
  JOIN inventory_items       ii ON ii.id = biv.item_id
  JOIN inventory_categories  ic ON ic.id = ii.category_id
  WHERE biv.id = NEW.brand_variant_id;

  IF v_category IS NULL OR v_category <> 'tools' THEN RETURN NEW; END IF;

  BEGIN
    v_receival_id := NEW.receival_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_receival_id := NULL;
  END;

  IF v_receival_id IS NOT NULL THEN
    SELECT ri.id INTO v_ri_id
    FROM receival_items ri
    WHERE ri.receival_id = v_receival_id
      AND ri.brand_variant_id = NEW.brand_variant_id
    LIMIT 1;
  END IF;

  -- Insert v_qty placeholder rows with NULL serial. UI shows them as
  -- "pending serial" and disables assignment until confirmed.
  FOR i IN 1..v_qty LOOP
    INSERT INTO tool_asset_units (
      item_id, receival_item_id, serial_number, is_placeholder,
      status, condition, brand
    ) VALUES (
      v_item_id, v_ri_id, NULL, true, 'available', 'Good', 'Default'
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let this trigger fail the receival — log and continue.
  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Tool Unit Auto-Create Failed',
    'inventory',
    'brand_variant',
    NEW.brand_variant_id,
    'system',
    'warning',
    jsonb_build_object(
      'sqlstate',      SQLSTATE,
      'sqlerrm',       SQLERRM,
      'receival_id',   NEW.receival_id,
      'brand_variant', NEW.brand_variant_id,
      'qty',           NEW.qty
    )::text
  );
  RETURN NEW;
END;
$$;

-- ─── 3. RPC to auto-generate serials for placeholder units ──────────────
-- Called from the Master Data UI when the user clicks the subtle
-- "Auto-generate serials" link. Fills NULL serials on any placeholders
-- for the given item using <sku>-<3-digit-ordinal>.

CREATE OR REPLACE FUNCTION public.auto_generate_tool_serials(
  p_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sku       text;
  v_next_ord  int;
  v_unit      RECORD;
  v_serial    text;
  v_updated   int := 0;
BEGIN
  SELECT sku INTO v_sku FROM inventory_items WHERE id = p_item_id;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'Item % not found or has no SKU', p_item_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tool_units_' || p_item_id::text));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(serial_number FROM ('^' || v_sku || '-(\d+)$')) AS int)),
    0
  ) INTO v_next_ord
  FROM tool_asset_units
  WHERE item_id = p_item_id
    AND serial_number ~ ('^' || v_sku || '-\d+$');

  FOR v_unit IN
    SELECT id FROM tool_asset_units
    WHERE item_id = p_item_id
      AND is_placeholder = true
      AND serial_number IS NULL
    ORDER BY created_at
  LOOP
    v_next_ord := v_next_ord + 1;
    v_serial   := v_sku || '-' || LPAD(v_next_ord::text, 3, '0');

    UPDATE tool_asset_units
       SET serial_number = v_serial
     WHERE id = v_unit.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'sku_prefix',    v_sku
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_generate_tool_serials(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
