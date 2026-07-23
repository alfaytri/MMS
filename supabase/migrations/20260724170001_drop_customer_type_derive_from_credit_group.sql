-- Drop customers.customer_type. From now on:
--   * credit_group_id IS NULL     → cash customer (default)
--   * credit_group_id IS NOT NULL → credit customer
--
-- customer_credit_summary is rebuilt to derive `customer_type` from the FK
-- instead of a stored column. The dropped column's CHECK constraint is
-- gone with the column.
--
-- The create_sale_order RPCs read customer_type via v_customer_type — those
-- get rewritten in the same migration to read from credit_group_id instead.

BEGIN;

-- 1. Rebuild the summary view without customer_type as a stored column.
DROP VIEW IF EXISTS public.customer_credit_summary;

-- 2. Drop the constraint + column.
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_type_check;

ALTER TABLE public.customers
  DROP COLUMN IF EXISTS customer_type;

-- 3. Recreate the view — customer_type is now derived.
CREATE OR REPLACE VIEW public.customer_credit_summary AS
SELECT
  c.id                                              AS customer_id,
  c.name                                            AS customer_name,
  c.name_ar                                         AS customer_name_ar,
  CASE
    WHEN c.credit_group_id IS NULL THEN 'cash'
    ELSE 'credit'
  END                                               AS customer_type,
  c.is_blocked                                      AS is_blocked,
  c.credit_group_id                                 AS credit_group_id,
  cg.name                                           AS credit_group_name,
  CASE
    WHEN c.credit_group_id IS NULL THEN 0
    ELSE COALESCE(cg.credit_limit, 0)
  END                                               AS credit_limit,
  public.customer_credit_used(c.id, NULL)           AS credit_used,
  GREATEST(
    CASE
      WHEN c.credit_group_id IS NULL THEN 0
      ELSE COALESCE(cg.credit_limit, 0)
    END
    - public.customer_credit_used(c.id, NULL),
    0
  )                                                 AS credit_available,
  CASE
    WHEN COALESCE(
           CASE WHEN c.credit_group_id IS NULL THEN 0
                ELSE COALESCE(cg.credit_limit, 0) END,
           0) = 0
      THEN NULL
    ELSE LEAST(
      ROUND(
        public.customer_credit_used(c.id, NULL)
        / NULLIF(CASE
                   WHEN c.credit_group_id IS NULL THEN 0
                   ELSE COALESCE(cg.credit_limit, 0)
                 END, 0)
        * 100, 1),
      100
    )
  END                                               AS credit_utilization_pct
FROM   public.customers c
LEFT   JOIN public.credit_groups cg ON cg.id = c.credit_group_id;

COMMENT ON VIEW public.customer_credit_summary IS
  'Live per-customer credit utilization. customer_type is derived from credit_group_id (cash when NULL, credit otherwise). credit_used computed from outstanding AR invoices + uninvoiced open SOs.';

GRANT SELECT ON public.customer_credit_summary TO authenticated, service_role;

-- 4. Patch the two create_sale_order overloads that read c.customer_type.
--    Both are rewritten so the "is-this-a-cash-customer" branch tests
--    credit_group_id IS NULL instead of customer_type = 'cash'.

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
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();

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

-- Legacy 17-arg overload (with p_expected_delivery) — same treatment.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
