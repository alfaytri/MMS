-- Report 2.3 — Cash: add doc_kind so the report grid can drill-down doc_no to
-- the right list (bill vs invoice). Supersedes 20260819390000; only doc_kind is
-- added (a CASE over the linked doc). Everything else is byte-identical.
-- Adds a column to the RETURNS TABLE, so the old function is dropped first
-- (CREATE OR REPLACE cannot change a function's return type).

DROP FUNCTION IF EXISTS public.rpc_report_cash(date, date, uuid[], uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_report_cash(
  p_start        date,
  p_end          date,
  p_division_ids uuid[] DEFAULT NULL,
  p_method_ids   uuid[] DEFAULT NULL
)
RETURNS TABLE (
  is_opening     boolean,
  date           date,
  payment_method text,
  doc_no         text,
  doc_kind       text,
  party          text,
  debit          numeric,
  credit         numeric,
  balance        numeric,
  division_id    uuid,
  division_name  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      p.id, p.date, p.created_at,
      pm.name                                  AS payment_method,
      COALESCE(si.invoice_id, bl.bill_number)  AS doc_no,
      CASE WHEN si.id IS NOT NULL THEN 'invoice'
           WHEN bl.id IS NOT NULL THEN 'bill' END AS doc_kind,
      COALESCE(cust.name, sup.name)            AS party,
      CASE WHEN p.direction = 'incoming' THEN COALESCE(p.amount_qar, 0) ELSE 0 END AS debit,
      CASE WHEN p.direction = 'outgoing' THEN COALESCE(p.amount_qar, 0) ELSE 0 END AS credit,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id)      AS division_id
    FROM public.payments p
    JOIN public.payment_methods pm ON pm.id = p.method_id AND pm.is_cash_equivalent
    LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
    LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
    LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
    LEFT JOIN public.bills bl           ON bl.id = p.bill_id
    LEFT JOIN public.customers cust     ON cust.id = p.customer_id
    LEFT JOIN public.suppliers sup      ON sup.id = p.supplier_id
    WHERE p.deleted_at IS NULL
      AND p.status::text IN ('completed', 'pending', 'processing')
      AND (p_method_ids IS NULL OR p.method_id = ANY(p_method_ids))
  ),
  scoped AS (
    SELECT * FROM base
    WHERE public.is_division_visible(division_id)
      AND (p_division_ids IS NULL OR division_id = ANY(p_division_ids))
  ),
  opening AS (
    SELECT COALESCE(SUM(debit - credit), 0) AS bal FROM scoped WHERE date < p_start
  )
  SELECT u.is_opening, u.date, u.payment_method, u.doc_no, u.doc_kind, u.party, u.debit, u.credit, u.balance, u.division_id, u.division_name
  FROM (
    SELECT true AS is_opening, p_start AS date, 'Opening balance'::text AS payment_method,
           NULL::text AS doc_no, NULL::text AS doc_kind, NULL::text AS party, NULL::numeric AS debit, NULL::numeric AS credit,
           (SELECT bal FROM opening) AS balance, NULL::uuid AS division_id, NULL::text AS division_name,
           '1900-01-01'::timestamptz AS sort_ts, 0 AS sort_seq
    UNION ALL
    SELECT false, s.date, s.payment_method, s.doc_no, s.doc_kind, s.party, s.debit, s.credit,
           (SELECT bal FROM opening) + SUM(s.debit - s.credit) OVER (ORDER BY s.date, s.created_at, s.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
           s.division_id, d.name,
           s.created_at AS sort_ts, 1 AS sort_seq
    FROM scoped s
    LEFT JOIN public.company_divisions d ON d.id = s.division_id
    WHERE s.date BETWEEN p_start AND p_end
  ) u
  ORDER BY u.sort_seq, u.date, u.sort_ts;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_cash(date, date, uuid[], uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_cash(date, date, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
