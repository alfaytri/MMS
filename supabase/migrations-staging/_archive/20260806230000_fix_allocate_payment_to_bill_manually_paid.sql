-- Second stale-column bug of the day. allocate_payment_to_bill still
-- selects bills.manually_paid — a column that was DROPPED by
-- 20260726190000_drop_bills_dead_columns.sql because the Mark-as-Paid UI
-- was removed per spec 2026-07-22 and every row was reset to false.
--
-- Symptom: rpc_apply_debit_note_to_bill (which PERFORMs allocate) raised
-- 42703 'column manually_paid does not exist' on the first real call.
--
-- Fix: rewrite allocate_payment_to_bill without manually_paid. The old
-- CASE preserved payment_status when manually_paid was true; that
-- override no longer exists, so payment_status always follows the
-- computed value.

CREATE OR REPLACE FUNCTION public.allocate_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid,
  p_amount     numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount INTO v_bill_total
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF v_bill_total IS NULL OR v_bill_total < 0 THEN
    RAISE EXCEPTION 'Bill % has an invalid total_amount (%) — refuse allocation. Fix the bill first.',
      p_bill_id, v_bill_total;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = v_new_status
   WHERE id = p_bill_id;
END;
$$;
