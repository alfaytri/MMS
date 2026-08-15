-- Multi-division PO (Phase 2) — split the P&L FX drill-down per division too.
--
-- 20260824000500 split the P&L `fx_net` line (realized FX on purchase payments)
-- across a mixed PO's divisions. The drill-down behind that line
-- (rpc_report_pnl_fx_detail) still attributed each FX-bearing payment to the PO
-- header division, so a division-filtered P&L would NOT reconcile with its own
-- FX detail dialog. This applies the SAME split to the detail: a purchase
-- payment on a weighted PO becomes one row per division (amounts + FX pro-rata
-- by line value); sales / non-PO payments keep header attribution. The detail's
-- SUM(net_fx) therefore ties back to the P&L `fx_net` under any division filter.
--
-- The RETURNS TABLE gains division_id / division_name, so the function must be
-- DROPped and recreated (CREATE OR REPLACE cannot change the return type).

DROP FUNCTION IF EXISTS public.rpc_report_pnl_fx_detail(date, date, uuid[]);

CREATE FUNCTION public.rpc_report_pnl_fx_detail(p_start date, p_end date, p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(payment_id uuid, payment_date date, doc_type text, doc_number text, doc_id uuid, currency text, amount numeric, amount_qar numeric, exchange_gain numeric, exchange_loss numeric, net_fx numeric, counterparty text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
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
      COALESCE(sup.name, cust.name)                           AS counterparty,
      COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id) AS hdr_div,
      COALESCE(po.id, bl.purchase_order_id)                   AS po_id
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
  ),
  attr AS (
    -- Purchase payment on a PO with per-division weights → split pro-rata.
    SELECT b.payment_id, b.payment_date, b.doc_type, b.doc_number, b.doc_id, b.currency,
           b.amount        * w.weight AS amount,
           b.amount_qar    * w.weight AS amount_qar,
           b.exchange_gain * w.weight AS exchange_gain,
           b.exchange_loss * w.weight AS exchange_loss,
           b.net_fx        * w.weight AS net_fx,
           b.counterparty,
           w.division_id            AS division_id
    FROM base b
    CROSS JOIN LATERAL public._po_division_weights(b.po_id) w
    UNION ALL
    -- Sales / non-PO / unweighted → header division, whole payment.
    SELECT b.payment_id, b.payment_date, b.doc_type, b.doc_number, b.doc_id, b.currency,
           b.amount, b.amount_qar, b.exchange_gain, b.exchange_loss, b.net_fx, b.counterparty,
           b.hdr_div AS division_id
    FROM base b
    WHERE NOT EXISTS (SELECT 1 FROM public._po_division_weights(b.po_id))
  )
  SELECT a.payment_id, a.payment_date, a.doc_type, a.doc_number, a.doc_id, a.currency,
         a.amount, a.amount_qar, a.exchange_gain, a.exchange_loss, a.net_fx, a.counterparty,
         a.division_id, d.name AS division_name
  FROM attr a
  LEFT JOIN public.company_divisions d ON d.id = a.division_id
  WHERE public.is_division_visible(a.division_id)
    AND (p_division_ids IS NULL OR a.division_id = ANY(p_division_ids))
  ORDER BY a.payment_date, a.payment_id, a.division_id;
$function$;

NOTIFY pgrst, 'reload schema';
