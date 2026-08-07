-- Two fixes from the money-path audit:
--
-- 1. rpc_create_purchase_order — rfq_supplier_ids column is uuid[] but the
--    INSERT built a text[] via ARRAY(SELECT jsonb_array_elements_text(...)).
--    Postgres 42804. Cast the ARRAY to uuid[].
--
-- 2. revert_landed_cost — the ISM reversal INSERT was written before
--    inventory_stock_movements.warehouse_id and .sub_container_id became
--    NOT NULL (Phase C.2.f, 2026-08-03). Every void-of-applied-LC has been
--    dying on 23502 since. Copy both columns through from the source ISM.

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id           uuid;
  v_po_number       text;
  v_creator         uuid := public._current_user_data_id();
  v_subtotal        numeric := 0;
  v_discount        numeric := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_exchange_rate   numeric := COALESCE((p_payload->>'exchange_rate')::numeric, 1);
  v_total_qar       numeric;
  v_approval_level  int;
  v_line            jsonb;
  v_lines           jsonb := COALESCE(p_payload->'line_items', '[]'::jsonb);
  v_rfq_suppliers   jsonb := COALESCE(p_payload->'rfq_supplier_ids', '[]'::jsonb);
  v_po_type         text  := COALESCE(p_payload->>'po_type', 'draft');
  v_resolved_name   text;
  v_po_row          purchase_orders%ROWTYPE;
BEGIN
  IF v_exchange_rate <= 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: exchange_rate must be > 0 (got %)', v_exchange_rate;
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: discount_amount cannot be negative (got %)', v_discount;
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: at least one line item is required';
  END IF;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    v_subtotal := v_subtotal + COALESCE((v_line->>'total_price')::numeric, 0);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'rpc_create_purchase_order: discount % exceeds subtotal %', v_discount, v_subtotal;
  END IF;

  v_total_qar := (v_subtotal - v_discount) * v_exchange_rate;
  v_approval_level := CASE
    WHEN v_total_qar < 5000  THEN 1
    WHEN v_total_qar < 50000 THEN 2
    ELSE 3
  END;

  v_po_number := (SELECT public.next_po_number());

  INSERT INTO purchase_orders (
    po_number, supplier_id, supplier_name, status,
    currency, exchange_rate, initial_exchange_rate,
    subtotal, total_qar, approval_level,
    created_date, expected_delivery, quote_deadline,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, vendor_notes,
    discount_amount, discount_label,
    created_by, division_id, po_type, rfq_supplier_ids
  ) VALUES (
    v_po_number,
    NULLIF(p_payload->>'supplier_id', '')::uuid,
    p_payload->>'supplier_name',
    'draft',
    COALESCE(p_payload->>'currency', 'QAR'),
    v_exchange_rate,
    v_exchange_rate,
    v_subtotal, v_total_qar, v_approval_level,
    CURRENT_DATE,
    NULLIF(p_payload->>'expected_delivery', '')::date,
    NULLIF(p_payload->>'quote_deadline', '')::date,
    p_payload->>'payment_terms',
    p_payload->>'payment_terms_notes',
    CASE WHEN p_payload->'payment_milestones' IS NULL THEN NULL
         ELSE p_payload->'payment_milestones' END,
    p_payload->>'delivery_terms',
    p_payload->>'delivery_terms_notes',
    p_payload->>'vendor_notes',
    v_discount,
    p_payload->>'discount_label',
    v_creator,
    NULLIF(p_payload->>'division_id', '')::uuid,
    v_po_type::po_type,
    ARRAY(SELECT jsonb_array_elements_text(v_rfq_suppliers))::uuid[]  -- ← cast added
  )
  RETURNING id INTO v_po_id;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    v_resolved_name := NULLIF(TRIM(v_line->>'item_name'), '');
    IF v_resolved_name IS NULL AND (v_line->>'brand_variant_id') IS NOT NULL THEN
      SELECT ii.name_en INTO v_resolved_name
        FROM inventory_item_brand_variants biv
        JOIN inventory_items ii ON ii.id = biv.item_id
       WHERE biv.id = (v_line->>'brand_variant_id')::uuid;
    END IF;

    INSERT INTO po_line_items (
      po_id, item_name, sku, qty, unit, unit_price, total_price,
      brand_variant_id, free_qty, received_qty, brand_id
    ) VALUES (
      v_po_id,
      COALESCE(v_resolved_name, 'Item'),
      v_line->>'sku',
      COALESCE((v_line->>'qty')::int, 0),
      COALESCE(v_line->>'unit', 'ea'),
      COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE((v_line->>'total_price')::numeric, 0),
      NULLIF(v_line->>'brand_variant_id', '')::uuid,
      COALESCE((v_line->>'free_qty')::int, 0),
      COALESCE((v_line->>'received_qty')::int, 0),
      NULLIF(v_line->>'brand_id', '')::uuid
    );
  END LOOP;

  IF v_po_type = 'rfq' AND jsonb_array_length(v_rfq_suppliers) > 0 THEN
    INSERT INTO po_rfq_quotes (po_id, supplier_id, currency, status)
    SELECT v_po_id, sid::uuid,
           COALESCE(p_payload->>'currency', 'QAR'),
           'pending'
    FROM jsonb_array_elements_text(v_rfq_suppliers) AS sid;
  END IF;

  SELECT * INTO v_po_row FROM purchase_orders WHERE id = v_po_id;
  RETURN to_jsonb(v_po_row);
END;
$$;

-- ── revert_landed_cost — copy warehouse_id + sub_container_id ──────────────

CREATE OR REPLACE FUNCTION public.revert_landed_cost(p_lc_id uuid, p_performer_name text DEFAULT 'System'::text)
RETURNS void
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

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  UPDATE landed_costs
     SET applied_at       = NULL,
         all_items_sold   = FALSE,
         revert_snapshot  = NULL,
         updated_at       = v_now
   WHERE id = p_lc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_landed_cost(uuid, text) TO authenticated;
