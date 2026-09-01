-- 20261019000000_fix_debit_note_offset_qar.sql
--
-- MONEY BUG FIX (MEDIUM, M1). When a debit note is applied to a supplier bill,
-- rpc_apply_debit_note_to_bill records the offset payment with a hardcoded
-- currency='QAR', exchange_rate=1, amount_qar=v_amount — but v_amount is in the
-- PO/bill's ORIGINAL currency (bills store PO-currency amounts). So for a
-- foreign-currency bill the payment's amount_qar is a foreign number mislabeled
-- as QAR, which understates QAR cash-out in rpc_financial_dashboard (cash side)
-- and rpc_report_pnl (cash basis), both of which sum COALESCE(amount_qar, amount).
--
-- Fix: resolve the bill's PO currency + booking rate and record currency /
-- exchange_rate / amount_qar correctly (amount_qar = v_amount * rate). The bill
-- balance stays in PO currency (allocate_payment_to_bill still uses v_amount), so
-- reconciliation is unchanged — only the QAR conversion on the payment is fixed.
--
-- Body reproduced verbatim from the live definition (20260806240000 — verified
-- latest, no later redefinition, references only current schema). ONLY the two
-- new locals, the currency/rate lookup, and the payment INSERT's currency/rate/
-- amount_qar values changed.

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
  v_bill_currency  text;
  v_bill_rate      numeric;
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

  -- The DN/bill amounts are in the PO's currency; resolve that currency + booking
  -- rate so the offset payment records amount_qar in QAR (was hardcoded QAR/1,
  -- understating QAR cash-out for foreign bills in the dashboard & P&L cash basis).
  SELECT
    CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE 'QAR' END,
    CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' AND COALESCE(po.exchange_rate, 0) > 0
         THEN po.exchange_rate ELSE 1 END
    INTO v_bill_currency, v_bill_rate
    FROM public.purchase_orders po
   WHERE po.id = v_bill.purchase_order_id;
  v_bill_currency := COALESCE(v_bill_currency, 'QAR');
  v_bill_rate     := COALESCE(v_bill_rate, 1);

  INSERT INTO payments (
    payment_id, bill_id, debit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, direction, status,
    notes
  ) VALUES (
    v_payment_id, v_bill.id, p_debit_note_id,
    v_amount, v_bill_currency, v_bill_rate, round(v_amount * v_bill_rate, 2),
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

NOTIFY pgrst, 'reload schema';
