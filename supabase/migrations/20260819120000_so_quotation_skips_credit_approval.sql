-- Fix: "Save as Quotation" must NOT trigger credit approval.
--
-- create_sale_order computed the credit-customer status with the over-limit
-- check FIRST, before the intent check:
--   WHEN v_total_qar > v_available THEN 'pending_approval'
--   WHEN p_intent = 'confirm'      THEN 'confirmed'
--   ELSE                                'quotation'
-- so an over-limit customer's *quotation* (intent='quotation') was forced into
-- 'pending_approval' and a credit-approval chain was built — even though a
-- quotation is only a quote, not a credit commitment. Operator-reported:
-- SO-2026-08-008 saved as a quotation went straight into Credit Approval.
--
-- Fix: let intent='quotation' short-circuit to 'quotation' BEFORE the credit
-- check. Only a *confirm* over the limit becomes pending_approval (and builds the
-- approval chain, which fires solely on v_so_status = 'pending_approval'). Cash
-- customers are unchanged (they never had a credit gate).
--
-- Body reproduced verbatim from live pg_get_functiondef (single (…,uuid) overload,
-- SECURITY DEFINER); the ONLY change is the credit-customer CASE ordering.

CREATE OR REPLACE FUNCTION public.create_sale_order(p_customer_id uuid, p_intent text, p_currency text, p_exchange_rate numeric, p_expected_delivery date, p_payment_terms text, p_payment_terms_notes text, p_payment_milestones jsonb, p_delivery_terms text, p_delivery_terms_notes text, p_customer_notes text, p_validity_days integer, p_discount_amount numeric, p_discount_label text, p_discount_type text, p_line_items jsonb, p_division_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_is_cash           BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  v_so_number := public.next_so_number();

  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - COALESCE(v_discount_resolved, 0);
  v_total_qar := v_total * p_exchange_rate;

  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
  INTO   v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF v_is_cash THEN
    v_so_status  := CASE
      WHEN p_intent = 'confirm' THEN 'confirmed'::sale_order_status
      ELSE                           'quotation'::sale_order_status
    END;
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    v_open_total := public.customer_credit_used(p_customer_id, NULL);

    v_available := v_credit_limit - v_open_total;

    -- A quotation is a quote, not a credit commitment — it never needs approval.
    -- Only a *confirm* over the available limit goes to pending_approval.
    v_so_status := CASE
      WHEN p_intent <> 'confirm'     THEN 'quotation'::sale_order_status
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      ELSE                                'confirmed'::sale_order_status
    END;
  END IF;

  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate,
    initial_exchange_rate, initial_rate_captured_at, initial_rate_captured_by,
    total_qar,
    expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by, division_id
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate,
    p_exchange_rate, now(), v_profile_id,
    v_total_qar,
    p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    v_profile_id, p_division_id
  )
  RETURNING id INTO v_so_id;

  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, avg_cost,
    created_by
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
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    v_profile_id
  FROM jsonb_array_elements(p_line_items) AS item;

  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'bv_id', (item->>'brand_variant_id')::UUID,
         'delta', (item->>'qty')::INTEGER
       ))
     FROM   jsonb_array_elements(p_line_items) AS item
     WHERE  (item->>'brand_variant_id') IS NOT NULL
       AND  (item->>'brand_variant_id') NOT IN ('', 'null')
       AND  (item->>'qty')::INTEGER > 0)
  );

  IF v_so_status = 'pending_approval'::sale_order_status THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available',    GREATEST(v_available, 0),
        'overage',      v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'so_id',        v_so_id,
    'so_number',    v_so_number,
    'status',       v_so_status,
    'credit_limit', v_credit_limit,
    'group_name',   v_group_name,
    'open_total',   v_open_total,
    'available',    GREATEST(v_available, 0)
  );
END;
$function$;
