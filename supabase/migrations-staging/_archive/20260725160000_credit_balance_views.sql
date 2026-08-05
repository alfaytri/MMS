-- Read-only aggregate views of open credit balances, per party per currency.
--
-- supplier_credit_balances → what SUPPLIERS owe US (via debit_notes with
--                            resolution_type='supplier_credit').
-- customer_credit_balances → what WE owe CUSTOMERS (via credit_notes with
--                            resolution_type='store_credit').
--
-- "Open" = status IN ('issued','approved') — i.e. the note is finalised
-- but not yet redeemed. Drafts don't count (not yet enforceable) and
-- redeemed notes don't count (already consumed).
--
-- Multi-currency: one row per (party, currency) — a supplier could hold
-- open credits in USD AND QAR simultaneously.
BEGIN;

-- ── Supplier side ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.supplier_credit_balances
WITH (security_invoker = on)
AS
SELECT
  po.supplier_id                     AS supplier_id,
  COALESCE(po.currency, 'QAR')       AS currency,
  COUNT(*)                           AS open_count,
  SUM(dn.total_amount)               AS open_amount
FROM   public.debit_notes  dn
JOIN   public.purchase_orders po ON po.id = dn.purchase_order_id
WHERE  dn.resolution_type = 'supplier_credit'
  AND  dn.status IN ('issued'::public.credit_note_status,
                     'approved'::public.credit_note_status)
  AND  po.supplier_id IS NOT NULL
GROUP  BY po.supplier_id, COALESCE(po.currency, 'QAR');

GRANT SELECT ON public.supplier_credit_balances TO authenticated;

-- ── Customer side ────────────────────────────────────────────────────────────
-- Customer/currency resolved through the linked invoice's SO, falling back to
-- the return's SO if the CN was created from a return without an invoice link.
CREATE OR REPLACE VIEW public.customer_credit_balances
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
)
SELECT
  customer_id,
  currency,
  COUNT(*)             AS open_count,
  SUM(total_amount)    AS open_amount
FROM   resolved
WHERE  customer_id IS NOT NULL
GROUP  BY customer_id, currency;

GRANT SELECT ON public.customer_credit_balances TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
