-- CN redemption RPC + client-INSERT lockdown.
-- Closes money-path findings C8, C9, C11 (and enables C12 hook rewrite).
--
-- Before: three separate client-side paths (useApplyCreditNote,
-- useApplyStoreCredit, and older useCreateCustomerPayment) inserted rows
-- into `payments` with `credit_note_id` set, with zero server-side check
-- that:
--   (a) the CN belongs to the same customer as the invoice
--   (b) prior redemptions + new amount stay ≤ CN.total_amount
--   (c) new amount ≤ invoice outstanding
--   (d) amount > 0
--   (e) the CN row is locked against concurrent redemptions
-- The direct-INSERT loophole let one CN be double-consumed as fake
-- payment + store credit for two different invoices, or partially
-- refunded past its total.
--
-- After: one SECURITY DEFINER RPC enforces all rules under a FOR UPDATE
-- lock. A RESTRICTIVE RLS policy on `payments` blocks the direct client
-- path — any INSERT with credit_note_id IS NOT NULL from an authenticated
-- session fails 42501 unless it comes from the RPC (which runs as the
-- table owner and bypasses RLS).
--
-- Redemption model (per operator decision 2026-08-06): full CN per
-- invoice — the RPC accepts an amount capped at min(CN.remaining,
-- invoice.outstanding). Splitting one CN across many invoices is not
-- supported by this RPC directly — the caller loops per invoice.

BEGIN;

-- ── 1. rpc_redeem_credit_note ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_redeem_credit_note(
  p_invoice_id     uuid,
  p_credit_note_id uuid,
  p_amount         numeric,
  p_method         text,               -- 'credit_note' or 'store_credit'
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_date           date DEFAULT NULL   -- defaults to today
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn             credit_notes%ROWTYPE;
  v_inv_customer   uuid;
  v_inv_total      numeric;
  v_paid           numeric;
  v_outstanding    numeric;
  v_prior_redeemed numeric;
  v_cn_remaining   numeric;
  v_payment_id     text;
  v_payment_uuid   uuid;
  v_last_num       int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount must be > 0 (got %)', p_amount;
  END IF;
  IF p_method NOT IN ('credit_note', 'store_credit') THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: method must be credit_note or store_credit (got %)', p_method;
  END IF;

  -- Lock the CN against concurrent redemptions
  SELECT * INTO v_cn
    FROM credit_notes
   WHERE id = p_credit_note_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: credit note % not found', p_credit_note_id;
  END IF;

  IF p_method = 'store_credit'
     AND v_cn.resolution_type IS DISTINCT FROM 'store_credit' THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN % is not resolved as store credit (resolution_type=%)',
      v_cn.credit_note_id, COALESCE(v_cn.resolution_type, 'null');
  END IF;

  -- Invoice ownership check
  SELECT customer_id, total_amount
    INTO v_inv_customer, v_inv_total
    FROM so_invoices
   WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: invoice % not found', p_invoice_id;
  END IF;
  IF v_cn.customer_id IS NULL OR v_cn.customer_id <> v_inv_customer THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: CN customer_id (%) does not match invoice customer_id (%)',
      COALESCE(v_cn.customer_id::text, 'null'), v_inv_customer;
  END IF;

  -- Cap 1: CN has enough remaining balance
  SELECT COALESCE(SUM(amount), 0)
    INTO v_prior_redeemed
    FROM payments
   WHERE credit_note_id = p_credit_note_id
     AND deleted_at IS NULL;
  v_cn_remaining := v_cn.total_amount - v_prior_redeemed;
  IF p_amount > v_cn_remaining THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds CN remaining balance % (total %, prior redemptions %)',
      p_amount, v_cn_remaining, v_cn.total_amount, v_prior_redeemed;
  END IF;

  -- Cap 2: invoice still has room
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM payments
   WHERE invoice_id = p_invoice_id
     AND direction = 'incoming'
     AND deleted_at IS NULL;
  v_outstanding := v_inv_total - v_paid;
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'rpc_redeem_credit_note: amount % exceeds invoice outstanding %', p_amount, v_outstanding;
  END IF;

  -- Generate next CPAY-XXXXX id (max-based, single-statement under RPC lock).
  SELECT COALESCE(MAX((substring(payment_id from 6))::int), 0)
    INTO v_last_num
    FROM payments
   WHERE payment_id ILIKE 'CPAY-%';
  v_payment_id := 'CPAY-' || LPAD((v_last_num + 1)::text, 5, '0');

  INSERT INTO payments (
    payment_id, invoice_id, customer_id, credit_note_id,
    amount, currency, exchange_rate, amount_qar,
    method, date, reference, notes, direction, status
  ) VALUES (
    v_payment_id, p_invoice_id, v_cn.customer_id, p_credit_note_id,
    p_amount, 'QAR', 1, p_amount,
    p_method, COALESCE(p_date, CURRENT_DATE),
    p_reference, p_notes, 'incoming', 'completed'
  )
  RETURNING id INTO v_payment_uuid;

  -- Recompute invoice payment_status. Triggers on `payments` normally handle
  -- this, but keeping it inline makes the RPC self-contained.
  UPDATE so_invoices
     SET payment_status = CASE
           WHEN (v_paid + p_amount) >= v_inv_total THEN 'paid'
           WHEN (v_paid + p_amount) > 0            THEN 'partially_paid'
           ELSE 'unpaid'
         END
   WHERE id = p_invoice_id;

  RETURN v_payment_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_redeem_credit_note(uuid, uuid, numeric, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_credit_note(uuid, uuid, numeric, text, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_redeem_credit_note(uuid, uuid, numeric, text, text, text, date) IS
'Redeem a credit note against one invoice. FOR-UPDATE-locks the CN row,
enforces customer match + amount ≤ min(CN remaining, invoice outstanding),
inserts a payment row (method=credit_note|store_credit) and recomputes the
invoice payment_status. Client code must go through this RPC — direct
INSERT into payments with credit_note_id IS NOT NULL is blocked by the
payments_no_direct_cn_insert restrictive RLS policy.';

-- ── 2. Restrictive policy blocking direct-INSERT loophole ────────────────

DROP POLICY IF EXISTS payments_no_direct_cn_insert ON public.payments;

CREATE POLICY payments_no_direct_cn_insert
  ON public.payments
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (credit_note_id IS NULL);

COMMENT ON POLICY payments_no_direct_cn_insert ON public.payments IS
'Restrictive: authenticated clients cannot insert payments rows with
credit_note_id set. Must use rpc_redeem_credit_note. SECURITY DEFINER RPC
runs as table owner and bypasses RLS, so the RPC path is unaffected.';

COMMIT;
