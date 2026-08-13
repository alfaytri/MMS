-- Extend rpc_apply_debit_note_to_bill to accept an explicit bill_id, and
-- improve the "no bill for PO" error copy.
--
-- Original signature only looked up bills via DN.purchase_order_id, so
-- the ApplyDebitNoteDialog's bill picker had no effect (the RPC always
-- targeted the DN's PO bill). Operators who wanted to apply against
-- another supplier bill were silently ignored, and DNs whose PO has no
-- bill yet threw "no bill exists for PO X" with no next-step hint.
--
-- New signature: p_bill_id is optional. When provided, the RPC uses that
-- bill directly (validating supplier match). When NULL, falls back to
-- looking up bills.purchase_order_id = DN.purchase_order_id — same as
-- before. Error copy updated to tell the operator what to do.

DROP FUNCTION IF EXISTS public.rpc_apply_debit_note_to_bill(uuid, numeric);

CREATE OR REPLACE FUNCTION public.rpc_apply_debit_note_to_bill(
  p_debit_note_id uuid,
  p_amount        numeric DEFAULT NULL,
  p_bill_id       uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dn             debit_notes%ROWTYPE;
  v_bill           bills%ROWTYPE;
  v_bill_paid      numeric;
  v_bill_outstand  numeric;
  v_amount         numeric;
  v_dn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
BEGIN
  IF p_debit_note_id IS NULL THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: p_debit_note_id is required';
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount must be > 0 (got %)', p_amount;
  END IF;

  SELECT * INTO v_dn
    FROM debit_notes
   WHERE id = p_debit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: debit note % not found', p_debit_note_id;
  END IF;

  v_dn_remaining := COALESCE(v_dn.remaining_amount, v_dn.total_amount);
  IF v_dn_remaining <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no remaining balance (%)',
      v_dn.debit_note_id, v_dn_remaining;
  END IF;

  -- Bill resolution: caller-provided > DN's own PO bill.
  IF p_bill_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % not found', p_bill_id;
    END IF;
    -- Supplier match — never let a DN pay off another supplier's bill.
    IF v_dn.supplier_name IS NOT NULL
       AND v_bill.supplier_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM suppliers s
          WHERE s.id = v_bill.supplier_id
            AND s.name IS DISTINCT FROM v_dn.supplier_name
       ) THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: selected bill belongs to a different supplier than the DN';
    END IF;
  ELSE
    IF v_dn.purchase_order_id IS NULL THEN
      RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: DN % has no purchase_order_id and no p_bill_id was provided',
        p_debit_note_id;
    END IF;
    SELECT * INTO v_bill
      FROM bills
     WHERE purchase_order_id = v_dn.purchase_order_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No bill exists for this PO yet. Create the bill first (Purchases → Bills → New), then apply the debit note.'
        USING HINT = 'Once the bill exists, reopen the DN and click Apply to Bill.';
    END IF;
  END IF;

  IF v_bill.total_amount IS NULL OR v_bill.total_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % has an invalid total_amount %',
      v_bill.id, v_bill.total_amount;
  END IF;

  v_bill_paid := COALESCE(v_bill.paid_amount, 0);
  v_bill_outstand := v_bill.total_amount - v_bill_paid;
  IF v_bill_outstand <= 0 THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: bill % is already fully paid', v_bill.bill_number;
  END IF;

  v_amount := COALESCE(p_amount, LEAST(v_dn_remaining, v_bill_outstand));
  IF v_amount > v_dn_remaining THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds DN remaining %', v_amount, v_dn_remaining;
  END IF;
  IF v_amount > v_bill_outstand THEN
    RAISE EXCEPTION 'rpc_apply_debit_note_to_bill: amount % exceeds bill outstanding %', v_amount, v_bill_outstand;
  END IF;

  SELECT COALESCE(MAX((substring(payment_id from 5))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'PAY-%';
  v_payment_id := 'PAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, bill_id, debit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, direction, status,
    notes
  ) VALUES (
    v_payment_id, v_bill.id, p_debit_note_id,
    v_amount, 'QAR', 1, v_amount,
    'debit_note', CURRENT_DATE, 'outgoing', 'completed',
    'Debit note ' || v_dn.debit_note_id || ' applied to bill ' || v_bill.bill_number
  )
  RETURNING id INTO v_payment_uuid;

  PERFORM public.allocate_payment_to_bill(v_payment_uuid, v_bill.id, v_amount);

  UPDATE debit_notes
     SET remaining_amount = v_dn_remaining - v_amount,
         bill_id          = v_bill.id,
         updated_at       = now()
   WHERE id = p_debit_note_id;

  RETURN v_payment_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_apply_debit_note_to_bill(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_apply_debit_note_to_bill(uuid, numeric, uuid) TO authenticated;
