-- Fix: rpc_create_purchase_bill INSERTs into bills.source_id and
-- bills.source, but neither column exists on the bills table (only
-- source_label does). Every "Create Bill" click was failing with
-- 42703 column "source_id" of relation "bills" does not exist.
--
-- Rest of the body preserved from 20260806160000.

CREATE OR REPLACE FUNCTION public.rpc_create_purchase_bill(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id     uuid;
  v_po_row      purchase_orders%ROWTYPE;
  v_bill_row    bills%ROWTYPE;
  v_bill_number text;
  v_subtotal    numeric := 0;
  v_discount    numeric := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_total       numeric;
  v_line        jsonb;
  v_lines       jsonb := COALESCE(p_payload->'line_items', '[]'::jsonb);
BEGIN
  IF (p_payload->>'purchase_order_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: purchase_order_id is required';
  END IF;
  IF (p_payload->>'supplier_id') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: supplier_id is required';
  END IF;
  IF (p_payload->>'due_date') IS NULL THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: due_date is required';
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount_amount cannot be negative (got %)', v_discount;
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: at least one line item is required';
  END IF;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    IF COALESCE((v_line->>'total')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'rpc_create_purchase_bill: line total cannot be negative (got %)', v_line->>'total';
    END IF;
    v_subtotal := v_subtotal + COALESCE((v_line->>'total')::numeric, 0);
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: discount % exceeds subtotal % — bill total would be negative',
      v_discount, v_subtotal;
  END IF;
  v_total := v_subtotal - v_discount;

  SELECT * INTO v_po_row FROM purchase_orders WHERE id = (p_payload->>'purchase_order_id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_purchase_bill: PO % not found', p_payload->>'purchase_order_id';
  END IF;
  v_bill_number := v_po_row.po_number || '-B';

  INSERT INTO bills (
    bill_number, supplier_id, purchase_order_id,
    receival_id, division_id, payment_status, needs_refresh,
    source_label, subtotal, discount_amount, discount_label,
    total_amount, issued_date, due_date, notes
  ) VALUES (
    v_bill_number,
    (p_payload->>'supplier_id')::uuid,
    v_po_row.id,
    NULLIF(p_payload->>'receival_id', '')::uuid,
    v_po_row.division_id,
    'unpaid',
    false,
    p_payload->>'source_label',
    v_subtotal, v_discount, p_payload->>'discount_label',
    v_total,
    CURRENT_DATE,
    (p_payload->>'due_date')::date,
    NULLIF(p_payload->>'notes', '')
  )
  RETURNING id INTO v_bill_id;

  FOR v_line IN SELECT jsonb_array_elements(v_lines) LOOP
    INSERT INTO bill_line_items (
      bill_id, description, qty, unit_price, total,
      match_status, match_note
    ) VALUES (
      v_bill_id,
      v_line->>'description',
      COALESCE((v_line->>'qty')::int, 1),
      COALESCE((v_line->>'unit_price')::numeric, 0),
      COALESCE((v_line->>'total')::numeric, 0),
      NULLIF(v_line->>'match_status', ''),
      NULLIF(v_line->>'match_note', '')
    );
  END LOOP;

  SELECT * INTO v_bill_row FROM bills WHERE id = v_bill_id;
  RETURN to_jsonb(v_bill_row);
END;
$$;
