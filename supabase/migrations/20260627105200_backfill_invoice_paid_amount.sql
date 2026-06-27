-- ─────────────────────────────────────────────────────────────────────────────
-- One-off backfill: AR invoices generated BEFORE 20260627105100 went live still
-- show paid_amount=0 even though their parent SO had payments. Re-point those
-- payments at the invoice and resync the invoice's paid_amount + payment_status.
-- Idempotent — safe to leave in the migration history.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Re-point SO payments at their AR invoice (if one exists)
UPDATE public.payments p
SET    source_type = 'invoice',
       source_id   = i.id
FROM   public.invoices i
WHERE  p.source_type = 'sale_order'
  AND  p.deleted_at IS NULL
  AND  i.sale_order_id = p.source_id
  AND  i.direction = 'ar';

-- Recompute paid_amount + payment_status for every AR invoice
WITH sums AS (
  SELECT  i.id                                       AS invoice_id,
          i.total_amount                             AS total,
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
         WHEN sums.paid >= sums.total THEN 'paid'
         WHEN sums.paid > 0           THEN 'partially_paid'
         ELSE                              'unpaid'
       END
FROM   sums
WHERE  i.id = sums.invoice_id;

COMMIT;
