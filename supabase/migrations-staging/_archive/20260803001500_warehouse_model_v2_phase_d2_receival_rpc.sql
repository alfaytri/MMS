-- =============================================================================
-- Warehouse Model v2 — Phase D.2 (a): create_and_approve_receival accepts
-- optional p_sub_container_id override.
--
-- When p_sub_container_id is NULL (default), behavior is unchanged from
-- Phase C.2.b — the RPC derives sub-container from (warehouse, PO division)
-- via _find_or_create_sub_container. When the operator picks explicitly
-- (Phase D.2 UI), the RPC validates the choice belongs to the same
-- warehouse + division and uses it verbatim.
--
-- Body sourced verbatim from pg_proc.prosrc (live staging body). Deltas:
--   1. Signature: append p_sub_container_id uuid DEFAULT NULL.
--   2. Two new local variables v_check_wh, v_check_div for validation.
--   3. Replace the single-line resolve `v_sub_container_id := _find_or_create_
--      sub_container(...)` with an IF/ELSE that honors the explicit override.
-- Everything else preserved verbatim.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_and_approve_receival(
  p_po_id            uuid,
  p_warehouse_id     uuid,
  p_date             date,
  p_received_by_name text,
  p_receival_number  text,
  p_notes            text,
  p_items            jsonb,
  p_sub_container_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receival_id       UUID;
  v_receival_number   TEXT;
  v_item              JSONB;
  v_bv_id             UUID;
  v_bv_ids            UUID[] := '{}';
  v_bv_id_elem        UUID;
  v_qty               INT;
  v_cost              NUMERIC;
  v_cost_qar          NUMERIC;
  v_pli_id            UUID;
  v_po_currency       TEXT;
  v_po_rate           NUMERIC;
  v_division_id       UUID;
  v_sub_container_id  UUID;
  v_check_wh          UUID;
  v_check_div         UUID;
BEGIN
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1), division_id
    INTO v_po_currency, v_po_rate, v_division_id
    FROM public.purchase_orders
   WHERE id = p_po_id;

  -- Resolve sub-container: operator override wins; else auto-derive.
  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id
      INTO v_check_wh, v_check_div
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND sc.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> p_warehouse_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, p_warehouse_id;
    END IF;
    IF v_check_div IS DISTINCT FROM v_division_id THEN
      RAISE EXCEPTION 'Sub-container % is in a different division (%) than the PO (%)',
        p_sub_container_id, v_check_div, v_division_id;
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_division_id);
  END IF;

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    v_cost_qar := v_cost * v_po_rate;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free,
      sub_container_id
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false),
      v_sub_container_id
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate,
      sub_container_id
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id,
      sub_container_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost_qar,
      'receival', v_receival_id,
      v_sub_container_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$$;
