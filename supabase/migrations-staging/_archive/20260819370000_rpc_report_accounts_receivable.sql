-- Report 2.1 — Accounts Receivable, one row per invoice (so_invoices canonical).
-- Due = total_amount - paid_amount; status derived (Paid / Over Due / Due).
-- SECURITY DEFINER + is_division_visible scoping; date range filters issued_date.

CREATE OR REPLACE FUNCTION public.rpc_report_accounts_receivable(
  p_division_ids uuid[] DEFAULT NULL,
  p_from         date   DEFAULT NULL,
  p_to           date   DEFAULT NULL,
  p_customer_id  uuid   DEFAULT NULL,
  p_status       text   DEFAULT NULL   -- 'Paid' | 'Due' | 'Over Due'
)
RETURNS TABLE (
  invoice_no    text,
  customer      text,
  so_no         text,
  sale_order_id uuid,
  issued_date   date,
  due_date      date,
  amount        numeric,
  paid          numeric,
  due           numeric,
  status        text,
  division_id   uuid,
  division_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.invoice_no, r.customer, r.so_no, r.sale_order_id, r.issued_date, r.due_date,
         r.amount, r.paid, r.due, r.status, r.division_id, r.division_name
  FROM (
    SELECT
      si.invoice_id AS invoice_no,
      cust.name     AS customer,
      so.so_number  AS so_no,
      si.sale_order_id,
      si.issued_date,
      si.due_date,
      si.total_amount                       AS amount,
      si.paid_amount                        AS paid,
      (si.total_amount - si.paid_amount)    AS due,
      CASE
        WHEN si.payment_status = 'paid' OR (si.total_amount - si.paid_amount) <= 0 THEN 'Paid'
        WHEN si.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      si.division_id,
      d.name AS division_name
    FROM public.so_invoices si
    LEFT JOIN public.customers cust        ON cust.id = si.customer_id
    LEFT JOIN public.sale_orders so        ON so.id   = si.sale_order_id
    LEFT JOIN public.company_divisions d   ON d.id    = si.division_id
    WHERE public.is_division_visible(si.division_id)
      AND (p_division_ids IS NULL OR si.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR si.issued_date >= p_from)
      AND (p_to   IS NULL OR si.issued_date <= p_to)
      AND (p_customer_id IS NULL OR si.customer_id = p_customer_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.invoice_no;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_accounts_receivable(uuid[], date, date, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_accounts_receivable(uuid[], date, date, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
