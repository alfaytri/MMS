-- 20261023000000_fix_bill_currency_in_dashboard.sql
--
-- MONEY BUG FIX (HIGH) — the deferred follow-up to 20261017. rpc_financial_dashboard
-- reads supplier-bill money (bills.total_amount / paid_amount) as if it were QAR,
-- but bills store amounts in the PO's ORIGINAL currency. So every AP figure on the
-- dashboard understates/overstates foreign-currency bills and even sums mixed
-- currencies together — the same bug 20261017 fixed for the payables/aging reports.
--
-- FIX: convert each bill's money to QAR via the same source-of-truth helper,
-- public._bill_qar_factor(bill_id), at the FOUR bill (AP) spots:
--     1. payables total + overdue        2. billed_this_month
--     3. monthly_trend.billed             4. top_overdue_suppliers.amount
-- The receivables (so_invoices) figures use an IDENTICAL SUM(total_amount-paid_amount)
-- shape but are a DIFFERENT currency concern and are deliberately left untouched —
-- the transform anchors on `INTO payables_total`, `INTO billed_this_month`,
-- `FROM bills`, and the `b.` alias so it can never hit the AR block.
--
-- Drift-proof: an in-place transform on the LIVE body (pg_get_functiondef+EXECUTE) —
-- the repo copy had drifted (invoices→so_invoices, doc_status stripped), which is
-- why this was split out of 20261017. Asserts exactly 5 helper insertions or aborts
-- with no change. Idempotent. Requires the helper from 20261017.

DO $do$
DECLARE
  v_def text;
  v_new text;
  v_cnt int;
BEGIN
  IF to_regprocedure('public._bill_qar_factor(uuid)') IS NULL THEN
    RAISE EXCEPTION 'dashboard FX fix needs public._bill_qar_factor(uuid) — apply migration 20261017 first';
  END IF;

  SELECT pg_get_functiondef('public.rpc_financial_dashboard()'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_financial_dashboard() not found'; END IF;

  IF v_def ~ '_bill_qar_factor' THEN
    RAISE NOTICE 'dashboard already FX-corrected — skipping';
    RETURN;
  END IF;

  v_new := v_def;

  -- 1. payables total + overdue (both bill SUMs), anchored by INTO payables_total
  --    so the identical receivables block (INTO receivables_total) is never matched
  v_new := regexp_replace(v_new,
    '(COALESCE\(SUM\()total_amount - paid_amount(\), 0\),\s+COALESCE\(SUM\(CASE WHEN due_date < CURRENT_DATE THEN )total_amount - paid_amount( END\), 0\),\s+COALESCE\(COUNT\(CASE WHEN due_date < CURRENT_DATE THEN 1 END\), 0\)\s+INTO payables_total)',
    '\1(total_amount - paid_amount) * public._bill_qar_factor(id)\2(total_amount - paid_amount) * public._bill_qar_factor(id)\3', 'g');

  -- 2. billed_this_month
  v_new := regexp_replace(v_new,
    '(SELECT COALESCE\(SUM\(total_amount)(\), 0\)\s+INTO billed_this_month)',
    '\1 * public._bill_qar_factor(id)\2', 'g');

  -- 3. monthly_trend.billed (anchored by FROM bills; the FROM so_invoices twin is untouched)
  v_new := regexp_replace(v_new,
    '(SELECT SUM\(total_amount)(\) FROM bills)',
    '\1 * public._bill_qar_factor(id)\2', 'g');

  -- 4. top_overdue_suppliers.amount (alias b.; the customers block uses i.)
  v_new := regexp_replace(v_new,
    '(SUM\()b\.total_amount - b\.paid_amount(\) AS amount)',
    '\1(b.total_amount - b.paid_amount) * public._bill_qar_factor(b.id)\2', 'g');

  SELECT count(*) INTO v_cnt FROM regexp_matches(v_new, 'public\._bill_qar_factor', 'g');
  IF v_cnt <> 5 THEN
    RAISE EXCEPTION 'dashboard FX transform: expected 5 _bill_qar_factor insertions (2+1+1+1), got % — aborting, no change', v_cnt;
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'rpc_financial_dashboard: bill (AP) figures now converted to QAR (% helper calls)', v_cnt;
END
$do$;

NOTIFY pgrst, 'reload schema';
