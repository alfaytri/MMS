-- 20261017000000_fix_bill_currency_in_payables_reports.sql
--
-- MONEY BUG FIX (HIGH). Supplier bills store total_amount / paid_amount in the
-- PO's ORIGINAL currency (USD/EUR/…), NOT QAR — a deliberate design so a bill's
-- balance reconciles against payments in the same currency (see
-- 20260722190000_bill_recompute_use_original_currency and
-- 20260819090000_bill_line_origin).
--
-- But the QAR-denominated payables reports read those figures as if they were
-- already QAR, with no FX conversion, and even SUM foreign + QAR bills together.
-- Verified against live data: 5 outstanding USD bills understate QAR payables by
-- ~176,493 (shown QAR 66,600 vs true QAR 243,093).
--
-- FIX (report-only; storage untouched): convert each bill's PO-currency money to
-- QAR using the PO's booking exchange rate, via one source-of-truth helper
-- _bill_qar_factor(bill_id). Bill<->payment reconciliation stays in PO currency.
--
-- SCOPE OF THIS MIGRATION — the two functions whose CURRENT body is known:
--   * rpc_report_accounts_payable  (live source: 20260824000500 — clean/current)
--   * rpc_purchase_aging_report    (bills-only; its only drift vs the tracked
--                                   body is the doc_status filter that
--                                   20260723160000 regex-stripped after
--                                   bills.doc_status was dropped — re-applied
--                                   here as a literal, plus the FX conversion)
--
-- DELIBERATELY NOT INCLUDED: rpc_financial_dashboard. The live DB has drifted
-- from the tracked migrations (invoices was renamed to so_invoices; doc_status
-- filters were regex-stripped in place), so the repo does not hold that
-- function's true current body. Its bill (AP) figures — payables total/overdue,
-- billed_this_month, monthly_trend.billed, top_overdue_suppliers — have the SAME
-- currency bug and must get the SAME _bill_qar_factor() treatment, but only
-- against its exact live definition (pg_get_functiondef). Handled in a follow-up.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Helper — multiplier that converts a bill's PO-currency money to QAR.
--    Returns the PO's booking exchange_rate for a foreign-currency PO, else 1
--    (QAR PO, manual/no-PO bill, or a missing/zero rate). SECURITY DEFINER so it
--    resolves the rate regardless of the caller's PO row visibility (the rate is
--    not sensitive); the aging report is SECURITY INVOKER and needs EXECUTE.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._bill_qar_factor(p_bill_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN po.currency IS NOT NULL
     AND po.currency <> 'QAR'
     AND COALESCE(po.exchange_rate, 0) > 0
    THEN po.exchange_rate
    ELSE 1
  END
  FROM public.bills b
  LEFT JOIN public.purchase_orders po ON po.id = b.purchase_order_id
  WHERE b.id = p_bill_id;
$function$;

REVOKE ALL ON FUNCTION public._bill_qar_factor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._bill_qar_factor(uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Accounts Payable — amount/paid/due now in QAR; po_amount is the original
--    PO-currency amount (was amount/exchange_rate, which was backwards).
--    Everything else (per-division allocation, filters, status, ordering) is
--    identical to the live source 20260824000500.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_report_accounts_payable(p_division_ids uuid[] DEFAULT NULL::uuid[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(bill_no text, supplier text, po_no text, po_id uuid, issued_date date, due_date date, amount numeric, paid numeric, due numeric, po_currency text, po_amount numeric, status text, division_id uuid, division_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
      -- Bills store money in the PO's currency; convert the per-division
      -- allocated amounts to QAR using the PO's booking rate.
      round(a.amount * f.factor, 2)            AS amount,
      round(a.paid   * f.factor, 2)            AS paid,
      round((a.amount - a.paid) * f.factor, 2) AS due,
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR' THEN po.currency ELSE NULL END AS po_currency,
      -- Original PO-currency amount, shown alongside the QAR value.
      CASE WHEN po.currency IS NOT NULL AND po.currency <> 'QAR'
           THEN round(a.amount, 2) ELSE NULL END AS po_amount,
      CASE
        WHEN b.payment_status = 'paid' OR (a.amount - a.paid) <= 0 THEN 'Paid'
        WHEN b.due_date < CURRENT_DATE THEN 'Over Due'
        ELSE 'Due'
      END AS status,
      a.division_id,
      d.name AS division_name
    FROM public.bills b
    LEFT JOIN public.suppliers s        ON s.id  = b.supplier_id
    LEFT JOIN public.purchase_orders po ON po.id = b.purchase_order_id
    CROSS JOIN LATERAL (
      -- Per-division allocation of THIS bill.
      WITH w AS (
        SELECT dw.division_id, dw.weight
        FROM public._po_division_weights(b.purchase_order_id) dw
      ),
      ranked AS (
        SELECT division_id, weight,
               row_number() OVER (ORDER BY weight DESC, division_id) AS rn
        FROM w
      ),
      base AS (
        SELECT rn, division_id,
               round(COALESCE(b.total_amount, 0) * weight, 2) AS amt_r,
               round(COALESCE(b.paid_amount,  0) * weight, 2) AS paid_r
        FROM ranked
      ),
      resid AS (
        SELECT COALESCE(b.total_amount, 0) - COALESCE(SUM(amt_r),  0) AS amt_res,
               COALESCE(b.paid_amount,  0) - COALESCE(SUM(paid_r), 0) AS paid_res
        FROM base
      )
      SELECT base.division_id,
             base.amt_r  + CASE WHEN base.rn = 1 THEN resid.amt_res  ELSE 0 END AS amount,
             base.paid_r + CASE WHEN base.rn = 1 THEN resid.paid_res ELSE 0 END AS paid
      FROM base CROSS JOIN resid
      UNION ALL
      -- Fallback: no line-division breakdown → whole bill on its own division.
      SELECT b.division_id, COALESCE(b.total_amount, 0), COALESCE(b.paid_amount, 0)
      WHERE NOT EXISTS (SELECT 1 FROM w)
    ) a
    CROSS JOIN LATERAL (SELECT public._bill_qar_factor(b.id) AS factor) f
    LEFT JOIN public.company_divisions d ON d.id = a.division_id
    WHERE public.is_division_visible(a.division_id)
      AND (p_division_ids IS NULL OR a.division_id = ANY(p_division_ids))
      AND (p_from IS NULL OR b.issued_date >= p_from)
      AND (p_to   IS NULL OR b.issued_date <= p_to)
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
  ) r
  WHERE (p_status IS NULL OR r.status = p_status)
  ORDER BY r.division_name, (r.status = 'Paid'), r.due_date, r.bill_no;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Purchase Aging — every outstanding bucket converted to QAR. Body is the
--    live definition (bills-only; the doc_status filter was already dropped by
--    20260723160000 when bills.doc_status was removed) with the FX conversion
--    added. Signature and the search_path lock (20260805220000) preserved.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_purchase_aging_report()
RETURNS TABLE (
  supplier_id       uuid,
  supplier_name     text,
  current_amt       numeric,
  days_1_30         numeric,
  days_31_60        numeric,
  days_61_90        numeric,
  days_over_90      numeric,
  total_outstanding numeric,
  bill_count        bigint
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    b.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN b.due_date >= CURRENT_DATE THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE - 90 THEN (b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id) END), 0) AS days_over_90,
    COALESCE(SUM((b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM bills b
  JOIN suppliers s ON s.id = b.supplier_id
  WHERE b.payment_status != 'paid'
    AND b.total_amount - b.paid_amount > 0
  GROUP BY b.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;

NOTIFY pgrst, 'reload schema';
