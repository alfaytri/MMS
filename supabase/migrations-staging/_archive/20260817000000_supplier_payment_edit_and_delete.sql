-- Supplier payment edit + delete RPCs.
--
-- Fills the AP-side self-service correction gap: today an operator who
-- records a supplier payment with the wrong amount / method / date has no
-- way to fix it — the only path is a debit note. AR has a "detach" flow
-- but no edit or delete either; this AP flow is deliberately full-fat
-- (amount + method + date + reference + notes + FX) with hard-delete via
-- payments.deleted_at.
--
-- Both RPCs run SECURITY DEFINER and enforce `purchase.payments.manage`
-- inside their body so they cannot be bypassed by clients that skip the
-- permission check in JS. The existing bill_recompute_paid_trg trigger
-- on payments (see 20260722170000_bill_paid_amount_auto_recompute.sql)
-- auto-recomputes the affected bill(s) on both UPDATE and DELETE.
--
-- Scope constraint: we refuse edits/deletes on payments that are
-- multi-allocated via payment_bill_allocations (>1 row). The AP flow
-- today never fans a single payment across many bills — the multi-alloc
-- path is used only for the AR "attach payment to bill" UI which lives
-- in the customer side. Keeping this guard simple avoids re-writing the
-- allocation logic in the delete/edit RPCs.

BEGIN;

-- ─── Edit ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_edit_supplier_payment(
  p_payment_id     uuid,
  p_amount         numeric,
  p_method         text,
  p_date           date,
  p_reference      text,
  p_notes          text,
  p_exchange_rate  numeric DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      public.payments;
  v_actor    uuid;
  v_alloc_ct int;
  v_rate     numeric;
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'purchase.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: purchase.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is already deleted', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  IF v_row.direction <> 'outgoing' THEN
    RAISE EXCEPTION 'Only outgoing (supplier) payments can be edited here' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_alloc_ct
  FROM public.payment_bill_allocations
  WHERE payment_id = p_payment_id;
  IF v_alloc_ct > 1 THEN
    RAISE EXCEPTION
      'Payment is allocated to % bills — detach the extra allocations before editing',
      v_alloc_ct
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;

  -- Currency + exchange_rate handling. If caller passed an exchange rate,
  -- honour it; otherwise keep the payment's stored rate. QAR always locks
  -- to 1 regardless of what was sent.
  v_rate := CASE
    WHEN v_row.currency = 'QAR' THEN 1
    WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN p_exchange_rate
    ELSE v_row.exchange_rate
  END;

  UPDATE public.payments
  SET amount        = p_amount,
      amount_qar    = p_amount * v_rate,
      method        = p_method,
      date          = p_date,
      reference     = NULLIF(TRIM(p_reference), ''),
      notes         = NULLIF(TRIM(p_notes),     ''),
      exchange_rate = v_rate,
      updated_at    = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  -- Keep any single allocation row in sync with the new amount so the
  -- bill balance recompute sees the right allocated total.
  IF v_alloc_ct = 1 THEN
    UPDATE public.payment_bill_allocations
    SET amount = p_amount
    WHERE payment_id = p_payment_id;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_supplier_payment(uuid, numeric, text, date, text, text, numeric)
  TO authenticated;

-- ─── Delete (soft) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_supplier_payment(p_payment_id uuid)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      public.payments;
  v_actor    uuid;
  v_alloc_ct int;
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'purchase.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: purchase.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    -- Idempotent: already deleted → no-op, return the existing row.
    RETURN v_row;
  END IF;
  IF v_row.direction <> 'outgoing' THEN
    RAISE EXCEPTION 'Only outgoing (supplier) payments can be deleted here' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_alloc_ct
  FROM public.payment_bill_allocations
  WHERE payment_id = p_payment_id;
  IF v_alloc_ct > 1 THEN
    RAISE EXCEPTION
      'Payment is allocated to % bills — detach the extra allocations before deleting',
      v_alloc_ct
      USING ERRCODE = 'P0001';
  END IF;

  -- Reverse the single-allocation row (if any) so the recompute trigger
  -- doesn't double-count it against a bill that just lost its payment.
  DELETE FROM public.payment_bill_allocations WHERE payment_id = p_payment_id;

  UPDATE public.payments
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier_payment(uuid)
  TO authenticated;

COMMIT;
