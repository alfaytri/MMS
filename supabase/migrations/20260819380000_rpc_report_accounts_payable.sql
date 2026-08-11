-- Report 2.2 — Accounts Payable, one row per bill (bills). Due = total_amount -
-- paid_amount; status derived. bills store QAR only, so the original PO-currency
-- amount is derived: total_amount / purchase_orders.exchange_rate (rate is
-- QAR-per-foreign; verified 2026-08-11), shown only for non-QAR POs.
-- SECURITY DEFINER + is_division_visible scoping.

CREATE OR REPLACE FUNCTION public.rpc_report_accounts_payable(
  p_division_ids uuid[] DEFAULT NULL,
  p_from         date   DEFAULT NULL,
  p_to           date   DEFAULT NULL,
  p_supplier_id  uuid   DEFAULT NULL,
  p_status       text   DEFAULT NULL
)
RETURNS TABLE (
  bill_no       text,
  supplier      text,
  po_no         text,
  po_id         uuid,
  issued_date   date,
  due_date      date,
  amount        numeric,
  paid          numeric,
  due           numeric,
  po_currency   text,
  po_amount     numeric,
  status        text,
  division_id   uuid,
  division_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.bill_no, r.supplier, r.po_no, r.po_id, r.issued_date, r.due_date,
         r.amount, r.paid, r.due, r.po_currency, r.po_amount, r.status, r.division_id, r.division_name
  FROM (
    SELECT
      b.bill_number AS bill_no,
      s.name        AS supplier,
      po.po_number  AS po_no,
      b.purchase_order_id AS po_id,
      b.issued_date,
      b.due_date,
      b.total_amount                              AS amount,
      COALESCE(b.paid_amount, 0)                  AS paid,
      (b.total_amount - COALESCE(b.paid_amount, 0)) AS due,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE NULL END AS po_currency,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' AND COALESCE(po.exchange_rate, 0) > 0
           THEN round(b.total_amount / po.exchange_rate, 2) ELSE NULL END                       AS po_amount,
      CASE
        WHEN b.payment_status = 'paid' OR (b.total_amount - COALESCE(b.paid_amount, 0)) <= 0 THEN 'Paid'
        WHEN b.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      b.division_id,
      d.name AS division_name
    FROM public.bills b
    LEFT JOIN public.suppliers s          ON s.id  = b.supplier_id
    LEFT JOIN public.purchase_orders po   ON po.id = b.purchase_order_id
    LEFT JOIN public.company_divisions d  ON d.id  = b.division_id
    WHERE public.is_division_visible(b.division_id)
      AND (p_division_ids IS NULL OR b.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR b.issued_date >= p_from)
      AND (p_to   IS NULL OR b.issued_date <= p_to)
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.bill_no;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_accounts_payable(uuid[], date, date, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_accounts_payable(uuid[], date, date, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
