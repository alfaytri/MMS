-- Refund liability: open standalone (non-return) credit notes minus any outgoing
-- refund payments already recorded against them. Distinct from store credit,
-- which stays with customer_credit_balances / customer_open_credit_notes.
BEGIN;

-- security_invoker=on so the view enforces the querying user's RLS on the
-- underlying tables (matches customer_credit_balances / customer_open_credit_notes).
CREATE OR REPLACE VIEW public.customer_refunds_payable WITH (security_invoker = on) AS
WITH refunded AS (
  SELECT p.credit_note_id, COALESCE(SUM(p.amount),0) AS paid_back
    FROM public.payments p
   WHERE p.credit_note_id IS NOT NULL
     AND p.direction = 'outgoing'
     AND p.deleted_at IS NULL
   GROUP BY p.credit_note_id
)
SELECT
  cn.customer_id,
  COALESCE(inv_so.currency, 'QAR')                       AS currency,
  cn.id                                                  AS credit_note_id,
  cn.credit_note_id                                      AS note_number,
  inv.invoice_id                                         AS invoice_number,
  inv_so.so_number                                       AS so_number,
  cn.created_at,
  cn.total_amount - COALESCE(r.paid_back,0)              AS amount_remaining
FROM public.credit_notes cn
LEFT JOIN refunded r          ON r.credit_note_id = cn.id
LEFT JOIN public.so_invoices inv ON inv.id = cn.invoice_id
LEFT JOIN public.sale_orders inv_so ON inv_so.id = inv.sale_order_id
WHERE cn.source_return_id IS NULL
  AND cn.status <> 'void'
  AND cn.resolution_type IS DISTINCT FROM 'store_credit'
  AND (cn.total_amount - COALESCE(r.paid_back,0)) > 0;

GRANT SELECT ON public.customer_refunds_payable TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
