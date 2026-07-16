-- ─────────────────────────────────────────────────────────────────────────────
-- Unify the two invoice-payment shapes so `invoices.paid_amount` stays correct
-- (and the credit limit frees up) no matter which button recorded the payment.
--
-- Until now, payments could land in the table in two distinct shapes:
--
--   A. source_type='invoice', source_id=<invoice.id>            — SO/SO-Payments
--      tab path, redirected by trg_payments_redirect_to_invoice
--   B. invoice_id=<invoice.id>, source_type=NULL                — Invoice tab
--      path (useCreateCustomerPayment); legacy customer-payment flow
--
-- The old `invoice_recompute_paid_fn` trigger only watched for shape (A), so
-- shape-(B) payments updated `payment_status` (set client-side) but NEVER
-- updated `paid_amount`. Since `customer_credit_used()` calculates
-- `total_amount - paid_amount`, the customer's credit appeared stuck at fully
-- used after paying through the Invoice tab.
--
-- Fix:
--   1. Extend `invoice_recompute_paid_fn` to also fire on shape-(B) payments
--      and to sum BOTH shapes when recomputing paid_amount.
--   2. Backfill `paid_amount` + `payment_status` for every AR invoice using
--      both shapes so existing customers who already paid have their credit
--      freed immediately.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  -- Pick the invoice this row points at, regardless of which shape it uses.
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
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

  -- UPDATE that moves a payment between invoices: resync the prior invoice too.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.invoices i
      SET    paid_amount    = summed.paid,
             payment_status = CASE
               WHEN summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0               THEN 'partially_paid'
               ELSE                                    'unpaid'
             END
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger definition unchanged; re-pointing to the updated function is enough.
DROP TRIGGER IF EXISTS trg_invoice_recompute_paid ON public.payments;
CREATE TRIGGER       trg_invoice_recompute_paid
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_recompute_paid_fn();

-- ── Backfill: every AR invoice's paid_amount + status from BOTH shapes ──────
WITH sums AS (
  SELECT  i.id                                              AS invoice_id,
          i.total_amount                                    AS total,
          COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
  FROM    public.invoices i
  LEFT    JOIN public.payments p
          ON  (
                (p.source_type = 'invoice' AND p.source_id = i.id)
                OR p.invoice_id = i.id
              )
          AND p.deleted_at IS NULL
          AND p.direction  = 'incoming'
  WHERE   i.direction = 'ar'
  GROUP   BY i.id, i.total_amount
)
UPDATE public.invoices i
SET    paid_amount    = sums.paid,
       payment_status = CASE
         WHEN sums.paid >= sums.total THEN 'paid'
         WHEN sums.paid > 0           THEN 'partially_paid'
         ELSE                              'unpaid'
       END
FROM   sums
WHERE  i.id = sums.invoice_id;

COMMIT;
