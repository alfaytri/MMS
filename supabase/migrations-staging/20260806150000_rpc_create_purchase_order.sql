-- Closes H1: useCreatePO was not atomic. It ran next_po_number → INSERT
-- purchase_orders → resolveLineItemNames → INSERT po_line_items → optional
-- INSERT po_rfq_quotes as four+ auto-committed calls. If po_line_items
-- INSERT failed (bad brand_variant, RLS, NOT NULL) the header committed
-- with a used PO number and zero lines — the operator saw "Failed to
-- create" but a partial PO already existed in the list and the PO number
-- was permanently consumed.
--
-- New RPC does header + lines + optional RFQ quotes in a single
-- transaction. Activity log + PO snapshot remain client-side after the
-- RPC returns — they're best-effort side effects whose failure does not
-- corrupt the money path.
--
-- Signature accepts a jsonb payload matching the CreatePOPayload shape:
--   {supplier_id, supplier_name, currency, exchange_rate,
--    expected_delivery, quote_deadline?, payment_terms?, ...,
--    line_items: [{item_name, sku?, qty, unit, unit_price, total_price,
--                  brand_variant_id?, free_qty?, brand_id?}, ...],
--    po_type?, rfq_supplier_ids?, division_id?, discount_amount, discount_label?}
-- Returns the new PO row (as jsonb) so the hook can preserve its optimistic-
-- update contract without a follow-up SELECT.

BEGIN;

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

  -- Compute subtotal from line items (never trust client for money)
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
    p_payload->>'supplier_id',
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
    ARRAY(SELECT jsonb_array_elements_text(v_rfq_suppliers))
  )
  RETURNING id INTO v_po_id;

  -- Insert line items; resolve missing item_name from inventory
  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    v_resolved_name := NULLIF(TRIM(v_line->>'item_name'), '');
    IF v_resolved_name IS NULL AND (v_line->>'brand_variant_id') IS NOT NULL THEN
      SELECT ii.name_en INTO v_resolved_name
        FROM inventory_item_brand_variants biv
        JOIN inventory_items ii ON ii.id = biv.inventory_item_id
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

  -- Optional RFQ quotes fan-out
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

REVOKE ALL ON FUNCTION public.rpc_create_purchase_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_purchase_order(jsonb) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_purchase_order(jsonb) IS
'Create a purchase order atomically. next_po_number + purchase_orders
INSERT + po_line_items INSERT + optional po_rfq_quotes fan-out all run
in one transaction. Validates subtotal computed server-side, discount ≤
subtotal, exchange_rate > 0, at least one line. Resolves missing
item_name from inventory_item_brand_variants when brand_variant_id is
given. Returns the new PO row as jsonb so the client does not need a
follow-up SELECT. Client still handles best-effort activity log +
snapshot after the RPC returns — those failures no longer corrupt the
money path.';

COMMIT;
