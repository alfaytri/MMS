-- Restore division_id in create_sale_order INSERT.
-- The Task 3 replacement (20260627100001) dropped division_id from the INSERT
-- column list, which would silently NULL out division on every new SO.
-- This re-issues the function with division_id wired back in.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_sale_order(
  p_customer_id          uuid,
  p_intent               text,
  p_currency             text,
  p_exchange_rate        numeric,
  p_expected_delivery    date,
  p_payment_terms        text,
  p_payment_terms_notes  text,
  p_payment_milestones   jsonb,
  p_delivery_terms       text,
  p_delivery_terms_notes text,
  p_customer_notes       text,
  p_validity_days        integer,
  p_discount_amount      numeric,
  p_discount_label       text,
  p_discount_type        text,
  p_line_items           jsonb,
  p_division_id          uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so_number         TEXT;
  v_count             INTEGER;
  v_subtotal          NUMERIC;
  v_discount_resolved NUMERIC;
  v_total             NUMERIC;
  v_total_qar         NUMERIC;
  v_credit_limit      NUMERIC;
  v_group_name        TEXT;
  v_open_total        NUMERIC;
  v_available         NUMERIC;
  v_so_status         sale_order_status;
  v_so_id             UUID;
  v_profile_id        UUID;
  v_customer_type     TEXT;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB   := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  -- ── Margin gate (below cost) — runs for EVERY submission, cash or credit
  IF p_intent = 'confirm' THEN
    SELECT jsonb_agg(item) FILTER (
      WHERE (item->>'avg_cost')::NUMERIC > 0
        AND (item->>'unit_price')::NUMERIC < (item->>'avg_cost')::NUMERIC
    )
    INTO v_below_cost_lines
    FROM jsonb_array_elements(p_line_items) AS item;

    IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
      v_has_below_cost := true;
    END IF;
  END IF;

  -- ── Credit gate (over limit) — credit customers only
  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    SELECT COALESCE(SUM(total), 0)
    INTO   v_open_total
    FROM   sale_orders
    WHERE  customer_id = p_customer_id
      AND  status      NOT IN ('cancelled')
      AND  deleted_at  IS NULL;

    v_available := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  -- ── Compute final SO status
  v_so_status := CASE
    WHEN p_intent <> 'confirm'                       THEN 'quotation'::sale_order_status
    WHEN v_exceeds_credit OR v_has_below_cost        THEN 'pending_approval'::sale_order_status
    ELSE                                                  'confirmed'::sale_order_status
  END;

  -- Insert SO
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    division_id,
    created_by
  ) VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    p_division_id,
    v_profile_id
  )
  RETURNING id INTO v_so_id;

  -- Insert lines (unchanged)
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost, created_by
  )
  SELECT
    v_so_id,
    item->>'item_name',
    NULLIF(item->>'sku', ''),
    (item->>'qty')::INTEGER,
    COALESCE(NULLIF(item->>'unit', ''), 'pcs'),
    (item->>'unit_price')::NUMERIC,
    (item->>'total')::NUMERIC,
    COALESCE(NULLIF(item->>'line_type', ''), 'products'),
    CASE
      WHEN (item->>'brand_variant_id') IS NOT NULL
        AND (item->>'brand_variant_id') NOT IN ('', 'null')
      THEN (item->>'brand_variant_id')::UUID
      ELSE NULL
    END,
    CASE
      WHEN (item->>'tool_asset_item_id') IS NOT NULL
        AND (item->>'tool_asset_item_id') NOT IN ('', 'null')
      THEN (item->>'tool_asset_item_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

  -- Reserve stock (unchanged)
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  -- ── Build approval slip rows for each gate that fired
  IF v_exceeds_credit THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available', GREATEST(v_available, 0),
        'overage',   v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  IF v_has_below_cost THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'margin',
      jsonb_build_object(
        'lines',       v_below_cost_lines,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',          v_so_id,
    'so_number',      v_so_number,
    'status',         v_so_status,
    'credit_limit',   v_credit_limit,
    'group_name',     v_group_name,
    'open_total',     v_open_total,
    'available',      GREATEST(v_available, 0),
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

COMMIT;
