-- ─────────────────────────────────────────────────────────────────────────────
-- Keep invoices.paid_amount + payment_status synced with the payments table.
--
-- Two triggers on `payments`:
--
-- 1. BEFORE INSERT — if a payment is being recorded against a sale_order that
--    already has an AR invoice, transparently redirect it to the invoice
--    (source_type='invoice', source_id=<invoice.id>). This means the
--    salesperson can press "Record Payment" on either the SO or the invoice;
--    the data always lands on the invoice.
--
-- 2. AFTER INSERT/UPDATE/DELETE — recompute paid_amount + payment_status on
--    every invoice affected by the change. Catches direct invoice payments,
--    redirected ones, deletions, and rare manual `source_type` rewrites.
--
-- Plus a one-off backfill at the end so SO-00003's existing payment
-- (recorded after INV-00004 was generated) lands on the invoice now.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── BEFORE-INSERT redirect ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payments_redirect_to_invoice_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF NEW.source_type <> 'sale_order' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice_id
  FROM   public.invoices
  WHERE  sale_order_id = NEW.source_id AND direction = 'ar'
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_redirect_to_invoice ON public.payments;
CREATE TRIGGER       trg_payments_redirect_to_invoice
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_redirect_to_invoice_fn();

-- ── AFTER-write recompute ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id; END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id; END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
    FROM   public.payments
    WHERE  source_type = 'invoice'
      AND  source_id   = v_invoice_id
      AND  deleted_at IS NULL
  )
  UPDATE public.invoices i
  SET    paid_amount    = summed.paid,
         payment_status = CASE
           WHEN summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0               THEN 'partially_paid'
           ELSE                                    'unpaid'
         END
  FROM   summed
  WHERE  i.id = v_invoice_id;

  -- If the prior row pointed to a different invoice (rare: someone moved a
  -- payment from invoice A to invoice B in a single UPDATE), recompute A too.
  IF TG_OP = 'UPDATE'
     AND OLD.source_type = 'invoice'
     AND OLD.source_id <> v_invoice_id THEN
    WITH summed AS (
      SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
      FROM   public.payments
      WHERE  source_type = 'invoice'
        AND  source_id   = OLD.source_id
        AND  deleted_at IS NULL
    )
    UPDATE public.invoices i
    SET    paid_amount    = summed.paid,
           payment_status = CASE
             WHEN summed.paid >= i.total_amount THEN 'paid'
             WHEN summed.paid > 0               THEN 'partially_paid'
             ELSE                                    'unpaid'
           END
    FROM   summed
    WHERE  i.id = OLD.source_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_recompute_paid ON public.payments;
CREATE TRIGGER       trg_invoice_recompute_paid
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_recompute_paid_fn();

-- ── Backfill: re-point existing SO-linked payments that have an AR invoice ─
UPDATE public.payments p
SET    source_type = 'invoice',
       source_id   = i.id
FROM   public.invoices i
WHERE  p.source_type = 'sale_order'
  AND  p.deleted_at IS NULL
  AND  i.sale_order_id = p.source_id
  AND  i.direction = 'ar';

-- ── Backfill: recompute every AR invoice's paid_amount + status ────────────
WITH sums AS (
  SELECT  i.id                                              AS invoice_id,
          i.total_amount,
          COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
  FROM    public.invoices i
  LEFT    JOIN public.payments p
          ON  p.source_type = 'invoice'
          AND p.source_id   = i.id
          AND p.deleted_at IS NULL
  WHERE   i.direction = 'ar'
  GROUP   BY i.id, i.total_amount
)
UPDATE public.invoices i
SET    paid_amount    = sums.paid,
       payment_status = CASE
         WHEN sums.paid >= sums.total_amount THEN 'paid'
         WHEN sums.paid > 0                  THEN 'partially_paid'
         ELSE                                     'unpaid'
       END
FROM   sums
WHERE  i.id = sums.invoice_id;

COMMIT;
