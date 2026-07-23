-- ============================================================================
-- Fix: allocate_payment_to_bill never updated invoices.paid_amount
-- ============================================================================
-- Symptom: Bill detail page showed "Total Paid: QAR 0.00" even when the
-- Payment History table listed payments totaling the full bill amount.
--
-- Cause: allocate_payment_to_bill recalculated payment_status from the
-- payment_bill_allocations table but never wrote the matching paid_amount
-- back to invoices. The bill row's paid_amount stayed at 0 forever.
--
-- Fix: also UPDATE invoices.paid_amount = SUM(allocations) in the same RPC.
-- Plus a one-shot backfill for every bill whose paid_amount disagrees with
-- its allocation total.

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
  v_manually_paid   BOOLEAN;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  -- Lock payment row to serialize concurrent allocations
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  -- Verify bill exists and get manually_paid flag
  SELECT total_amount, manually_paid INTO v_bill_total, v_manually_paid
  FROM invoices WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  -- Check total allocations would not exceed payment amount
  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  -- Upsert allocation
  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  -- Always recalculate the cached totals on the bill, even when manually_paid
  -- so the displayed paid_amount + balance stay correct.
  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices
     SET paid_amount    = v_total_paid,
         payment_status = CASE WHEN v_manually_paid THEN payment_status ELSE v_new_status END
   WHERE id = p_bill_id;
END;
$$;

-- One-time backfill: every invoice whose paid_amount disagrees with the
-- allocation total gets corrected.
UPDATE invoices i
   SET paid_amount = COALESCE(a.total, 0)
  FROM (
    SELECT bill_id, SUM(amount) AS total
    FROM payment_bill_allocations
    GROUP BY bill_id
  ) a
 WHERE a.bill_id = i.id
   AND COALESCE(i.paid_amount, 0) <> a.total;

NOTIFY pgrst, 'reload schema';
