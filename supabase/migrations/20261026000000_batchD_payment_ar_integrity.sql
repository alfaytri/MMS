-- 20261026000000_batchD_payment_ar_integrity.sql  (audit Batch D: H3, H8)
--
-- H3 (HIGH): bill_recompute_paid_fn counts a debit-note / allocated payment TWICE
-- — once in the payments sum (it carries bill_id) and again in the
-- payment_bill_allocations sum — and LEAST(paid,total) hides the overflow, so
-- bills can read fully "paid" while under-paid. Fix: the payments sum excludes any
-- payment that also has a payment_bill_allocations row (those are counted in the
-- allocations sum). payment_bill_allocations.payment_id -> payments(id).
--
-- H8 (HIGH): rpc_customer_statement credits a credit note twice — once when issued
-- (credit_note leg) and again when redeemed (the payment leg has no method filter,
-- so credit_note/store_credit redemption payments count as cash). Fix: exclude
-- those two methods from the payment leg.
--
-- Drift-proof in-place transforms; assert or abort; idempotent.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  -- ===== H3: bill_recompute_paid_fn — de-duplicate allocated payments =====
  SELECT pg_get_functiondef('public.bill_recompute_paid_fn(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'bill_recompute_paid_fn not found'; END IF;
  IF v_def ~ 'payment_bill_allocations pba' THEN
    RAISE NOTICE 'D-H3 already de-duplicated — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(OR bill_id = p_bill_id\s*\)\s*AND\s+direction = ''outgoing''\s+AND\s+deleted_at IS NULL)(\s*\), 0\);)',
      '\1' || E'\n      AND  NOT EXISTS (SELECT 1 FROM public.payment_bill_allocations pba WHERE pba.payment_id = payments.id)' || '\2',
      'g');
    IF v_new !~ 'NOT EXISTS \(SELECT 1 FROM public\.payment_bill_allocations pba WHERE pba\.payment_id = payments\.id\)' THEN
      RAISE EXCEPTION 'D-H3: edit did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'D-H3: bill_recompute no longer double-counts allocated payments';
  END IF;

  -- ===== H8: rpc_customer_statement — count each credit note once =====
  SELECT pg_get_functiondef('public.rpc_customer_statement'::regproc) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_customer_statement not found'; END IF;
  IF v_def ~ 'NOT IN \(''credit_note'', ''store_credit''\)' THEN
    RAISE NOTICE 'D-H8 already filters redemption methods — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(WHERE p\.direction = ''incoming''\s+AND p\.deleted_at IS NULL)',
      '\1' || E'\n    AND COALESCE(p.method::text, '''') NOT IN (''credit_note'', ''store_credit'')',
      'g');
    -- Pre-existing latent bug: description references credit_notes.type, a dropped
    -- column (the credit_note leg would error at runtime once any CN row matched).
    -- Fix it here since the CREATE OR REPLACE re-parses and would otherwise fail.
    v_new := regexp_replace(v_new,
      'COALESCE\(cn\.reason, cn\.type\)',
      'COALESCE(cn.reason, cn.resolution_type::text)', 'g');
    IF v_new !~ 'NOT IN \(''credit_note'', ''store_credit''\)' OR v_new ~ 'cn\.type\)' THEN
      RAISE EXCEPTION 'D-H8: edit did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'D-H8: customer statement no longer double-counts redeemed credit notes';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
