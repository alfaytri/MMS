-- 20261030000000_batchE_h7_cash_division.sql  (audit H7)
--
-- H7 (HIGH): rpc_report_cash takes a payment's division from document HEADERS only
-- (COALESCE(so, po, si, bl).division_id). A multi-division PO carries its division
-- on line items, leaving the header NULL, and `division_id = ANY(p_division_ids)`
-- then DROPS the payment (NULL = ANY(...) is NULL) from any division-scoped cash
-- report — ledger row and opening balance both.
--
-- Fix: fall back to the PO's DOMINANT division (largest _po_division_weights share)
-- when the header is NULL, so a multi-division PO payment is attributed to a real
-- division instead of dropped. (A cash ledger keeps one row per payment with a
-- running balance, so the whole payment is attributed to its dominant division
-- rather than split — the pragmatic choice for cash; the P&L, an aggregate, still
-- splits by weight.)
--
-- RESIDUAL (not a code fix): incoming SO/invoice payments whose SO has NO division
-- at all (sale_order_lines carry no division) remain unattributed — those orders
-- need a division assigned in Master Data.
--
-- Drift-proof in-place transform; assert or abort; idempotent.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_report_cash(date,date,uuid[],uuid[])'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_report_cash not found'; END IF;
  IF v_def ~ '_po_division_weights\(po\.id\)' THEN
    RAISE NOTICE 'H7 already resolves dominant PO division — skip';
  ELSE
    v_new := regexp_replace(v_def,
      'COALESCE\(so\.division_id, po\.division_id, si\.division_id, bl\.division_id\)(\s+AS division_id)',
      'COALESCE(so.division_id, po.division_id, si.division_id, bl.division_id, (SELECT w.division_id FROM public._po_division_weights(po.id) w ORDER BY w.weight DESC NULLS LAST LIMIT 1))\1',
      'g');
    IF v_new !~ '_po_division_weights\(po\.id\)' THEN
      RAISE EXCEPTION 'H7: edit did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'H7: cash report now attributes multi-division PO payments to their dominant division';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
