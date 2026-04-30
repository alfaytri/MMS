-- supabase/migrations/20260430120000_invoice_payment_rpcs.sql

-- ─── 1. Add customer_id column ───────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- ─── 2. Backfill existing incoming payments ──────────────────────────────────
-- Via already-linked invoice
UPDATE payments p
SET customer_id = i.customer_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.direction = 'incoming'
  AND p.customer_id IS NULL;

-- Via source sale order (for payments recorded against SOs before invoice existed)
UPDATE payments p
SET customer_id = so.customer_id
FROM sale_orders so
WHERE p.source_type = 'sale_order'
  AND p.source_id   = so.id
  AND p.direction   = 'incoming'
  AND p.customer_id IS NULL;

-- ─── 3. Shared recalculation function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION recalculate_ar_invoice_payment_status(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total    NUMERIC;
  v_manually BOOLEAN;
  v_paid     NUMERIC;
  v_status   TEXT;
BEGIN
  SELECT total_amount, COALESCE(manually_paid, FALSE)
  INTO   v_total, v_manually
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF v_total IS NULL THEN RETURN; END IF;
  IF v_manually THEN RETURN; END IF;

  SELECT COALESCE(ROUND(SUM(amount), 2), 0)
  INTO   v_paid
  FROM   payments
  WHERE  invoice_id = p_invoice_id
    AND  direction  = 'incoming'
    AND  deleted_at IS NULL;

  v_status := CASE
    WHEN v_paid >= ROUND(v_total, 2) THEN 'paid'
    WHEN v_paid > 0                   THEN 'partially_paid'
    ELSE 'unpaid'
  END;

  UPDATE invoices SET payment_status = v_status WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ─── 4. Trigger function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_recalc_ar_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    -- If invoice_id was re-pointed, recalc the old invoice too
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      IF OLD.invoice_id IS NOT NULL THEN
        PERFORM recalculate_ar_invoice_payment_status(OLD.invoice_id);
      END IF;
    END IF;
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM recalculate_ar_invoice_payment_status(v_invoice_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Attach trigger ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS payments_recalc_ar_status ON payments;
CREATE TRIGGER payments_recalc_ar_status
AFTER INSERT OR UPDATE OF amount, invoice_id, deleted_at OR DELETE
ON payments
FOR EACH ROW EXECUTE FUNCTION trg_recalc_ar_payment_status();

-- ─── 6. attach_payment_to_invoice RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION attach_payment_to_invoice(
  p_payment_id UUID,
  p_invoice_id UUID
) RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;                           -- row-level lock prevents concurrent attach

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already linked to an invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  -- Ownership guard: skip check for NULL customer_id (legacy backfill miss)
  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = p_invoice_id WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$ LANGUAGE plpgsql;

-- ─── 7. detach_payment_from_invoice RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION detach_payment_from_invoice(
  p_payment_id UUID,
  p_invoice_id UUID
) RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
  v_invoice RECORD;
BEGIN
  SELECT id, direction, invoice_id, customer_id
  INTO   v_payment
  FROM   payments
  WHERE  id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
  IF v_payment.direction != 'incoming' THEN
    RAISE EXCEPTION 'Payment must be direction=incoming';
  END IF;
  IF v_payment.invoice_id IS DISTINCT FROM p_invoice_id THEN
    RAISE EXCEPTION 'Payment is not linked to this invoice';
  END IF;

  SELECT id, customer_id
  INTO   v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_payment.customer_id IS NOT NULL
     AND v_payment.customer_id IS DISTINCT FROM v_invoice.customer_id THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;

  UPDATE payments SET invoice_id = NULL WHERE id = p_payment_id;
  -- Trigger fires automatically → recalculate_ar_invoice_payment_status
END;
$$ LANGUAGE plpgsql;
