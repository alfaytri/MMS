-- Phase 2 of drop-compat-views: rewrite create_sale_order (both overloads) +
-- resubmit_sale_order to reference `user_data` directly instead of the
-- `profiles` compat view. Only `FROM profiles` → `FROM user_data` changes;
-- signatures, return types, SECURITY DEFINER, search_path all preserved.
BEGIN;

-- ── create_sale_order — 18-arg (current) overload ────────────────────────────
CREATE OR REPLACE FUNCTION public.create_sale_order(
  p_customer_id          uuid,
  p_intent               text,
  p_currency             text,
  p_exchange_rate        numeric,
  p_subtotal             numeric,
  p_discount_amount      numeric,
  p_discount_label       text,
  p_discount_type        text,
  p_payment_terms        text,
  p_payment_terms_notes  text,
  p_payment_milestones   jsonb,
  p_delivery_terms       text,
  p_delivery_terms_notes text,
  p_customer_notes       text,
  p_validity_days        integer,
  p_notes                text,
  p_line_items           jsonb,
  p_division_id          uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_cash           BOOLEAN;
  v_subtotal          NUMERIC := COALESCE(p_subtotal, 0);
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
  v_so_number         TEXT;
  v_exceeds_credit    BOOLEAN := false;
  v_has_below_cost    BOOLEAN := false;
  v_below_cost_lines  JSONB := '[]'::jsonb;
  v_line              JSONB;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  v_discount_resolved := COALESCE(p_discount_amount, 0);
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  SELECT (c.credit_group_id IS NULL), cg.credit_limit, cg.name
  INTO   v_is_cash, v_credit_limit, v_group_name
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  SELECT jsonb_agg(jsonb_build_object(
           'item_name',  (li->>'item_name'),
           'unit_price', (li->>'unit_price')::numeric,
           'avg_cost',   COALESCE((li->>'avg_cost')::numeric, 0)
         )) FILTER (WHERE COALESCE((li->>'avg_cost')::numeric, 0) > 0
                       AND (li->>'unit_price')::numeric < COALESCE((li->>'avg_cost')::numeric, 0))
  INTO   v_below_cost_lines
  FROM   jsonb_array_elements(p_line_items) li;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  IF v_is_cash THEN
    v_credit_limit := 0;
    v_group_name   := 'Cash';
    v_open_total   := 0;
    v_available    := 0;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;

    v_open_total := public.customer_credit_used(p_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;

    IF p_intent = 'confirm' AND v_total_qar > v_available THEN
      v_exceeds_credit := true;
    END IF;
  END IF;

  IF p_intent = 'save_quote' THEN
    v_so_status := 'quotation';
  ELSIF v_exceeds_credit OR v_has_below_cost THEN
    v_so_status := 'pending_approval';
  ELSE
    v_so_status := 'confirmed';
  END IF;

  v_so_number := generate_so_id();
  INSERT INTO sale_orders (
    so_number, customer_id, status, currency, exchange_rate,
    subtotal, discount_amount, discount_amount_resolved, discount_label, discount_type,
    total, validity_days, payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes, customer_notes, notes,
    created_by, division_id
  ) VALUES (
    v_so_number, p_customer_id, v_so_status, p_currency, p_exchange_rate,
    v_subtotal, v_discount_resolved, v_discount_resolved, p_discount_label, p_discount_type,
    v_total, p_validity_days, p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes, p_customer_notes, p_notes,
    v_profile_id, p_division_id
  ) RETURNING id INTO v_so_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    INSERT INTO sale_order_lines (
      sale_order_id, item_name, sku, qty, unit, unit_price, total,
      line_type, brand_variant_id, avg_cost
    ) VALUES (
      v_so_id,
      (v_line->>'item_name'),
      (v_line->>'sku'),
      (v_line->>'qty')::numeric,
      (v_line->>'unit'),
      (v_line->>'unit_price')::numeric,
      (v_line->>'total')::numeric,
      (v_line->>'line_type'),
      NULLIF((v_line->>'brand_variant_id'), '')::uuid,
      COALESCE((v_line->>'avg_cost')::numeric, 0)
    );
  END LOOP;

  IF v_exceeds_credit THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'credit',
      jsonb_build_object(
        'available',     GREATEST(v_available, 0),
        'overage',       v_total_qar - v_available,
        'requested_by',  v_profile_id
      )
    );
  END IF;
  IF v_has_below_cost THEN
    PERFORM public.build_sales_approval_chain(
      v_so_id, 'margin',
      jsonb_build_object(
        'lines',         v_below_cost_lines,
        'requested_by',  v_profile_id
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

-- ── create_sale_order — 17-arg legacy overload ───────────────────────────────
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
  v_is_cash           BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

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

    SELECT COALESCE(SUM(total), 0)
    INTO   v_open_total
    FROM   sale_orders
    WHERE  customer_id = p_customer_id
      AND  status      NOT IN ('cancelled')
      AND  deleted_at  IS NULL;

    v_available := v_credit_limit - v_open_total;

    v_so_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      WHEN p_intent = 'confirm'      THEN 'confirmed'::sale_order_status
      ELSE                                'quotation'::sale_order_status
    END;
  END IF;

  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by, division_id
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
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
$$;

-- ── resubmit_sale_order ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resubmit_sale_order(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so               RECORD;
  v_customer         RECORD;
  v_total_qar        NUMERIC;
  v_open_total       NUMERIC;
  v_available        NUMERIC;
  v_exceeds_credit   BOOLEAN := false;
  v_has_below_cost   BOOLEAN := false;
  v_below_cost_lines JSONB := '[]'::jsonb;
  v_profile_id       uuid;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  SELECT * INTO v_so FROM sale_orders WHERE id = p_so_id;
  IF NOT FOUND OR v_so.status <> 'quotation' THEN
    RAISE EXCEPTION 'SO not resubmittable';
  END IF;

  -- customer_type column was dropped (20260724170001); credit vs cash is now
  -- derived from credit_group_id IS NULL. credit_limit IS NOT NULL implies a
  -- credit customer, so the check below is sufficient.
  SELECT cg.credit_limit
  INTO   v_customer
  FROM   customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = v_so.customer_id;

  v_total_qar := v_so.total * COALESCE(v_so.exchange_rate, 1);

  SELECT jsonb_agg(jsonb_build_object(
           'item_name', item_name, 'unit_price', unit_price, 'avg_cost', avg_cost
         )) FILTER (WHERE avg_cost > 0 AND unit_price < avg_cost)
  INTO   v_below_cost_lines
  FROM   sale_order_lines WHERE sale_order_id = p_so_id;

  IF v_below_cost_lines IS NOT NULL AND jsonb_array_length(v_below_cost_lines) > 0 THEN
    v_has_below_cost := true;
  END IF;

  IF v_customer.credit_limit IS NOT NULL THEN
    v_open_total := public.customer_credit_used(v_so.customer_id, p_so_id);
    v_available  := v_customer.credit_limit - v_open_total;
    IF v_total_qar > v_available THEN v_exceeds_credit := true; END IF;
  END IF;

  IF v_exceeds_credit OR v_has_below_cost THEN
    UPDATE sale_orders SET status = 'pending_approval' WHERE id = p_so_id;
    IF v_exceeds_credit THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'credit',
        jsonb_build_object('available', GREATEST(v_available,0),
                           'overage',   v_total_qar - COALESCE(v_available, 0),
                           'requested_by', v_profile_id)
      );
    END IF;
    IF v_has_below_cost THEN
      PERFORM public.build_sales_approval_chain(
        p_so_id, 'margin',
        jsonb_build_object('lines', v_below_cost_lines, 'requested_by', v_profile_id)
      );
    END IF;
  ELSE
    UPDATE sale_orders SET status = 'confirmed' WHERE id = p_so_id;
  END IF;

  RETURN jsonb_build_object(
    'exceeds_credit', v_exceeds_credit,
    'has_below_cost', v_has_below_cost
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
