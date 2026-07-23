-- Fix create_sale_order RPC — remove references to sale_order_lines.tool_asset_item_id.
--
-- The column was dropped in 20260723290000_drop_tool_asset_items_and_columns.sql,
-- but create_sale_order was last redefined in 20260627109000_credit_used_reflects_payments.sql
-- and still INSERTs into that column, breaking every "create sale order" call:
--   ERROR: column "tool_asset_item_id" of relation "sale_order_lines" does not exist
--
-- Fix: re-issue CREATE OR REPLACE without the two tool_asset_item_id references.
-- Everything else in the function body is unchanged from 20260627109000.

BEGIN;

-- Drop every existing create_sale_order overload first — an older 17-arg
-- variant (with p_expected_delivery) from the baseline is still in the DB
-- and its body references the dropped tool_asset_item_id column.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_sale_order'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

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
  v_customer_type     TEXT;
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

  SELECT c.customer_type, cg.credit_limit, cg.name
  INTO   v_customer_type, v_credit_limit, v_group_name
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

  IF COALESCE(v_customer_type, 'credit') = 'cash' THEN
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

COMMIT;
