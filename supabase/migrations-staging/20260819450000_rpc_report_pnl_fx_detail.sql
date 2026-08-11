-- Report 2.4 — Profit & Loss: Exchange Gain/Loss drill-down.
--
-- Per-payment FX breakdown behind the P&L "Exchange Gain / Loss" line: which
-- document (PO / SO / Bill / Invoice) each realized FX amount came from, so the
-- operator can open that document and confirm. Division-scoped exactly like the
-- FX total in rpc_report_pnl (payments carry no division; it's derived from the
-- linked doc). No warehouse filter — payments aren't warehouse-scoped.

CREATE OR REPLACE FUNCTION public.rpc_report_pnl_fx_detail(
  p_start        date,
  p_end          date,
  p_division_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  payment_id    uuid,
  payment_date  date,
  doc_type      text,
  doc_number    text,
  doc_id        uuid,
  currency      text,
  amount        numeric,
  amount_qar    numeric,
  exchange_gain numeric,
  exchange_loss numeric,
  net_fx        numeric,
  counterparty  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id                                                    AS payment_id,
    p.date                                                  AS payment_date,
    CASE
      WHEN po.id IS NOT NULL THEN 'Purchase Order'
      WHEN so.id IS NOT NULL THEN 'Sale Order'
      WHEN bl.id IS NOT NULL THEN 'Bill'
      WHEN si.id IS NOT NULL THEN 'Invoice'
      ELSE '—'
    END                                                     AS doc_type,
    COALESCE(po.po_number, so.so_number, bl.bill_number)    AS doc_number,
    COALESCE(po.id, so.id, bl.id, si.id)                    AS doc_id,
    COALESCE(NULLIF(p.currency, ''), po.currency)           AS currency,
    p.amount                                                AS amount,
    p.amount_qar                                            AS amount_qar,
    COALESCE(p.exchange_gain, 0)                            AS exchange_gain,
    COALESCE(p.exchange_loss, 0)                            AS exchange_loss,
    COALESCE(p.exchange_gain, 0) - COALESCE(p.exchange_loss, 0) AS net_fx,
    COALESCE(sup.name, cust.name)                           AS counterparty
  FROM public.payments p
  LEFT JOIN public.purchase_orders po ON p.source_type = 'purchase_order' AND po.id = p.source_id
  LEFT JOIN public.sale_orders so     ON p.source_type = 'sale_order'     AND so.id = p.source_id
  LEFT JOIN public.so_invoices si     ON si.id = p.invoice_id
  LEFT JOIN public.bills bl           ON bl.id = p.bill_id
  LEFT JOIN public.suppliers sup      ON sup.id = COALESCE(po.supplier_id, bl.supplier_id, p.supplier_id)
  LEFT JOIN public.customers cust     ON cust.id = COALESCE(so.customer_id, p.customer_id)
  WHERE p.deleted_at IS NULL
    AND p.date BETWEEN p_start AND p_end
    AND (COALESCE(p.exchange_gain, 0) <> 0 OR COALESCE(p.exchange_loss, 0) <> 0)
    AND public.is_division_visible(COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id))
    AND (p_division_ids IS NULL OR COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) = ANY(p_division_ids))
  ORDER BY p.date, p.id;
$function$;

REVOKE ALL ON FUNCTION public.rpc_report_pnl_fx_detail(date, date, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_report_pnl_fx_detail(date, date, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
