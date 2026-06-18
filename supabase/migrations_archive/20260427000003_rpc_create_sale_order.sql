-- supabase/migrations/20260427000003_rpc_create_sale_order.sql
BEGIN;

CREATE OR REPLACE FUNCTION create_sale_order(
  p_customer_id          UUID,
  p_intent               TEXT,    -- 'quotation' | 'confirm'
  p_currency             TEXT,
  p_exchange_rate        NUMERIC,
  p_expected_delivery    DATE,
  p_payment_terms        TEXT,
  p_payment_terms_notes  TEXT,
  p_payment_milestones   JSONB,
  p_delivery_terms       TEXT,
  p_delivery_terms_notes TEXT,
  p_customer_notes       TEXT,
  p_validity_days        INTEGER,
  p_discount_amount      NUMERIC,
  p_discount_label       TEXT,
  p_discount_type        TEXT,
  p_line_items           JSONB    -- [{item_name,sku,qty,unit,unit_price,total,line_type,brand_variant_id,tool_asset_item_id,avg_cost}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- ── Serialise concurrent SO creation for this customer ─────────────────────
  -- pg_advisory_xact_lock is released automatically at transaction end.
  -- Two salespeople confirming orders for the same customer at the same moment
  -- will queue here instead of both passing the credit check.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- ── Generate SO number (safe within lock) ──────────────────────────────────
  SELECT COUNT(*) + 1 INTO v_count FROM sale_orders;
  v_so_number := 'SO-' || LPAD(v_count::text, 5, '0');

  -- ── Calculate totals ───────────────────────────────────────────────────────
  SELECT COALESCE(SUM((item->>'total')::NUMERIC), 0)
  INTO   v_subtotal
  FROM   jsonb_array_elements(p_line_items) AS item;

  v_discount_resolved := CASE p_discount_type
    WHEN 'percentage' THEN (v_subtotal * p_discount_amount) / 100
    ELSE p_discount_amount
  END;
  v_total     := v_subtotal - v_discount_resolved;
  v_total_qar := v_total * p_exchange_rate;

  -- ── Credit check (atomic — within same transaction as insert) ──────────────
  SELECT cg.credit_limit, cg.name
  INTO   v_credit_limit, v_group_name
  FROM   customers c
  JOIN   credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_credit_group';
  END IF;

  -- All non-cancelled outstanding totals consume credit (includes delivered-unpaid).
  SELECT COALESCE(SUM(total), 0)
  INTO   v_open_total
  FROM   sale_orders
  WHERE  customer_id = p_customer_id
    AND  status NOT IN ('cancelled')
    AND  deleted_at IS NULL;

  v_available := v_credit_limit - v_open_total;

  -- 'confirm' intent requires credit to be available — hard block.
  -- 'quotation' intent saves as pending_approval when credit is exceeded.
  IF p_intent = 'confirm' AND v_total_qar > v_available THEN
    RAISE EXCEPTION 'credit_exceeded'
      USING DETAIL = json_build_object(
        'available', GREATEST(v_available, 0),
        'needed',    v_total_qar
      )::text;
  END IF;

  v_so_status := CASE
    WHEN p_intent = 'confirm'         THEN 'confirmed'::sale_order_status
    WHEN v_total_qar <= v_available   THEN 'quotation'::sale_order_status
    ELSE                                   'pending_approval'::sale_order_status
  END;

  -- ── Insert SO ──────────────────────────────────────────────────────────────
  INSERT INTO sale_orders (
    so_number, customer_id, status,
    subtotal, tax, total,
    discount_amount, discount_label, discount_type, discount_amount_resolved,
    currency, exchange_rate, expected_delivery,
    payment_terms, payment_terms_notes, payment_milestones,
    delivery_terms, delivery_terms_notes,
    customer_notes, validity_days,
    created_by
  )
  VALUES (
    v_so_number, p_customer_id, v_so_status,
    v_subtotal, 0, v_total,
    p_discount_amount, p_discount_label, p_discount_type, v_discount_resolved,
    p_currency, p_exchange_rate, p_expected_delivery,
    p_payment_terms, p_payment_terms_notes, p_payment_milestones,
    p_delivery_terms, p_delivery_terms_notes,
    p_customer_notes, p_validity_days,
    auth.uid()
  )
  RETURNING id INTO v_so_id;

  -- ── Insert line items ──────────────────────────────────────────────────────
  INSERT INTO sale_order_lines (
    sale_order_id, item_name, sku, qty, unit,
    unit_price, total, line_type,
    brand_variant_id, tool_asset_item_id, avg_cost,
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
    CASE
      WHEN (item->>'tool_asset_item_id') IS NOT NULL
        AND (item->>'tool_asset_item_id') NOT IN ('', 'null')
      THEN (item->>'tool_asset_item_id')::UUID
      ELSE NULL
    END,
    COALESCE(NULLIF(item->>'avg_cost', '')::NUMERIC, 0),
    auth.uid()
  FROM jsonb_array_elements(p_line_items) AS item;

  -- ── Reserve inventory stock ────────────────────────────────────────────────
  PERFORM batch_update_reserved_qty(
    (SELECT jsonb_agg(jsonb_build_object('bv_id', (item->>'brand_variant_id')::UUID, 'delta', (item->>'qty')::INTEGER))
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
    'available',    GREATEST(v_available, 0)  -- floor at 0 for display
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale_order(UUID,TEXT,TEXT,NUMERIC,DATE,TEXT,TEXT,JSONB,TEXT,TEXT,TEXT,INTEGER,NUMERIC,TEXT,TEXT,JSONB) TO authenticated;

COMMIT;
