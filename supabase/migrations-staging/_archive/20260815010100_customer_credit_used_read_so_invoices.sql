-- Fix root cause behind "100% used" showing on paid credit customers.
--
-- `customer_credit_used(customer_id, exclude_so_id)` was written against
-- `public.invoices`, but AR invoices for sale orders actually live in
-- `public.so_invoices` (generate_invoice_from_so / rpc_sync_invoice_from_so
-- both write there). Result: the "invoiced" CTE always returned 0, and
-- the "uninvoiced" CTE picked up every SO at its full `so.total` because
-- the LEFT JOIN to `public.invoices` never matched. Payments recorded
-- against those SOs never freed up credit.
--
-- Rewrite to read from `so_invoices` — that table has:
--   sale_order_id, customer_id, total_amount, paid_amount, status
-- and its `paid_amount` is kept fresh by
-- `_recompute_ar_invoice_payment_status_fn` on every payment insert/update/delete.
--
-- Cash-mode invoices (status='paid_cash' or similar) still net to zero
-- because total - paid_amount = 0 for them.

CREATE OR REPLACE FUNCTION public.customer_credit_used(
  p_customer_id   uuid,
  p_exclude_so_id uuid DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH invoiced AS (
    SELECT COALESCE(
             SUM(GREATEST(si.total_amount - COALESCE(si.paid_amount, 0), 0)),
             0
           ) AS outstanding
    FROM   so_invoices si
    WHERE  si.customer_id = p_customer_id
      AND  COALESCE(si.status, 'draft') <> 'cancelled'
      AND  (p_exclude_so_id IS NULL OR si.sale_order_id IS NULL OR si.sale_order_id <> p_exclude_so_id)
  ),
  uninvoiced AS (
    SELECT COALESCE(SUM(so.total * COALESCE(so.exchange_rate, 1)), 0) AS open_total
    FROM   sale_orders so
    LEFT   JOIN so_invoices si
           ON  si.sale_order_id = so.id
    WHERE  so.customer_id = p_customer_id
      AND  so.status      NOT IN ('cancelled')
      AND  so.deleted_at  IS NULL
      AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id)
      AND  si.id IS NULL
  )
  SELECT (SELECT outstanding FROM invoiced)
       + (SELECT open_total  FROM uninvoiced);
$$;

REVOKE ALL ON FUNCTION public.customer_credit_used(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_credit_used(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
