-- Store credit as a payment method on customer invoices.
--
-- When a customer holds an open store-credit balance (credit_note with
-- resolution_type='store_credit'), we let them redeem it against an invoice.
-- Redemption = payment record with method='store_credit' + credit_note_id set.
--
-- Design choice: no status flip on the credit_note itself. Redemption is
-- purely derived — `applied = SUM(payments.amount WHERE credit_note_id = cn.id
-- AND direction='incoming' AND deleted_at IS NULL)`. Once applied = total,
-- the balance view naturally stops surfacing the CN. This avoids trigger
-- drift risk (same reason we kept balance in a view, not a column).
BEGIN;

-- 1. Link payments to the credit_note they redeemed (nullable — only set for
--    store_credit payments).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS credit_note_id uuid
    REFERENCES public.credit_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_credit_note_id_idx
  ON public.payments(credit_note_id)
 WHERE credit_note_id IS NOT NULL;

-- 2. Rebuild customer_credit_balances to subtract already-redeemed amounts.
--    A CN with total 200 and 150 already redeemed surfaces as open_amount=50.
--    A CN fully redeemed no longer surfaces at all.
DROP VIEW IF EXISTS public.customer_credit_balances;

CREATE VIEW public.customer_credit_balances
WITH (security_invoker = on)
AS
WITH resolved AS (
  SELECT
    cn.id,
    cn.total_amount,
    COALESCE(inv_so.customer_id, ret_so.customer_id) AS customer_id,
    COALESCE(inv_so.currency,    ret_so.currency, 'QAR') AS currency
  FROM   public.credit_notes cn
  LEFT JOIN public.so_invoices    inv    ON inv.id = cn.invoice_id
  LEFT JOIN public.sale_orders    inv_so ON inv_so.id = inv.sale_order_id
  LEFT JOIN public.so_po_returns  spr    ON spr.id = cn.source_return_id
                                          AND spr.source_type = 'sale_order'
  LEFT JOIN public.sale_orders    ret_so ON ret_so.id = spr.source_id
  WHERE  cn.resolution_type = 'store_credit'
    AND  cn.status IN ('issued'::public.credit_note_status,
                       'approved'::public.credit_note_status)
),
redemptions AS (
  SELECT credit_note_id, COALESCE(SUM(amount), 0) AS applied
  FROM   public.payments
  WHERE  credit_note_id IS NOT NULL
    AND  direction     = 'incoming'
    AND  deleted_at    IS NULL
  GROUP  BY credit_note_id
)
SELECT
  r.customer_id,
  r.currency,
  COUNT(*)                                                       AS open_count,
  SUM(r.total_amount - COALESCE(red.applied, 0))                 AS open_amount
FROM   resolved r
LEFT JOIN redemptions red ON red.credit_note_id = r.id
WHERE  r.customer_id IS NOT NULL
  AND  (r.total_amount - COALESCE(red.applied, 0)) > 0
GROUP  BY r.customer_id, r.currency;

GRANT SELECT ON public.customer_credit_balances TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
