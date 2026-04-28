BEGIN;

-- Atomic RPC: links a payment to a bill and recalculates payment_status.
-- Runs entirely in one transaction — partial state is impossible.
-- Guards against reassignment and invalid IDs (Issues 1 & 2 fix).
CREATE OR REPLACE FUNCTION attach_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_invoice_id uuid;
  v_bill_total          numeric;
  v_total_paid          numeric;
  v_new_status          text;
BEGIN
  -- Guard: verify payment exists and is not already linked
  SELECT invoice_id INTO v_existing_invoice_id
  FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  IF v_existing_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is already attached to invoice %',
      p_payment_id, v_existing_invoice_id;
  END IF;

  -- Guard: verify bill exists before writing
  SELECT total_amount INTO v_bill_total
  FROM invoices WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  -- Link payment to bill
  UPDATE payments
  SET invoice_id = p_bill_id
  WHERE id = p_payment_id;

  -- Sum all outgoing payments now linked to this bill
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM payments
   WHERE invoice_id = p_bill_id
     AND direction = 'outgoing';

  -- Derive correct status
  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices
  SET payment_status = v_new_status
  WHERE id = p_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION attach_payment_to_bill(uuid, uuid) TO authenticated;

COMMIT;
