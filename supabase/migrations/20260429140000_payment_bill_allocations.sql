BEGIN;

-- ── New allocations table ───────────────────────────────────────────────────
CREATE TABLE payment_bill_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, bill_id)
);

CREATE INDEX idx_pba_payment ON payment_bill_allocations (payment_id);
CREATE INDEX idx_pba_bill    ON payment_bill_allocations (bill_id);

-- Match existing RLS pattern on payments/invoices tables
ALTER TABLE payment_bill_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage payment_bill_allocations"
  ON payment_bill_allocations
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Backfill from existing payments.invoice_id ──────────────────────────────
INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
SELECT p.id, p.invoice_id, p.amount
FROM payments p
WHERE p.invoice_id IS NOT NULL
  AND p.direction  = 'outgoing';

-- ── New RPC: allocate_payment_to_bill ────────────────────────────────────────
-- Supports partial allocation with an explicit amount.
-- Uses SELECT ... FOR UPDATE to serialize concurrent allocations.
-- Respects manually_paid flag: skips status recalculation when manually set.
CREATE OR REPLACE FUNCTION allocate_payment_to_bill(
  p_payment_id UUID,
  p_bill_id    UUID,
  p_amount     NUMERIC
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Skip status recalculation if user manually set the status
  IF v_manually_paid THEN
    RETURN;
  END IF;

  -- Recalculate bill payment_status from allocations
  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices SET payment_status = v_new_status WHERE id = p_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_payment_to_bill(uuid, uuid, numeric) TO authenticated;

-- ── Compatibility shim: keep attach_payment_to_bill working ─────────────────
-- Replaces the old RPC so existing callers still work.
-- Allocates the full payment amount to the bill.
CREATE OR REPLACE FUNCTION attach_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_amount NUMERIC;
BEGIN
  SELECT amount INTO v_payment_amount
  FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  PERFORM allocate_payment_to_bill(p_payment_id, p_bill_id, v_payment_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION attach_payment_to_bill(uuid, uuid) TO authenticated;

COMMIT;
