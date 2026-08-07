-- Follow-up to 20260817000000_supplier_payment_edit_and_delete.sql.
--
-- Gap found during operator smoke: payments created by rpc_settle_installment
-- are referenced by payment_installments.payment_id. Editing or deleting such
-- a payment left the installment (and its plan) claiming money that no longer
-- exists:
--   • delete → installment stayed status='paid' with paid_amount intact,
--     plan possibly 'completed', while the payment was soft-deleted.
--   • edit (amount) → installment paid_amount drifted from the payment.
--
-- This migration rewrites both RPCs (bodies sourced from 20260817000000,
-- which this session created — live body verified identical) to:
--   • edit: shift linked installments' paid_amount by the amount delta,
--     recompute their status, and re-derive the plan's active/completed state.
--   • delete: subtract the payment amount from linked installments, clear
--     their payment_id, recompute status, and un-complete the plan if needed.
-- Cancelled plans are never touched.

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
  v_row        public.payments;
  v_actor      uuid;
  v_alloc_ct   int;
  v_rate       numeric;
  v_old_amount numeric;
  v_plan_ids   uuid[];
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

  v_old_amount := v_row.amount;

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

  -- Installment linkage (payments created by rpc_settle_installment):
  -- shift paid_amount by the delta, recompute status, re-derive plan state.
  SELECT array_agg(DISTINCT plan_id) INTO v_plan_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount + (p_amount - v_old_amount)),
        updated_at  = now()
    WHERE payment_id = p_payment_id;

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE payment_id = p_payment_id;

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
  END IF;

  RETURN v_row;
END;
$$;

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
  v_plan_ids uuid[];
  v_inst_ids uuid[];
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

  -- Installment linkage: capture plan + installment ids BEFORE clearing
  -- payment_id, then reverse the settled amount and re-derive status.
  -- Status recompute targets ONLY the reversed installments — other rows in
  -- the plan keep their state (e.g. 'overdue' set by the due-date job).
  SELECT array_agg(DISTINCT plan_id), array_agg(id)
  INTO v_plan_ids, v_inst_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount - v_row.amount),
        payment_id  = NULL,
        updated_at  = now()
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_installments
    SET status = CASE
          WHEN paid_amount >= amount THEN 'paid'
          WHEN paid_amount > 0       THEN 'partial'
          ELSE                            'pending'
        END
    WHERE id = ANY(v_inst_ids);

    UPDATE public.payment_plans pp
    SET status     = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM public.payment_installments pi
            WHERE pi.plan_id = pp.id AND pi.status <> 'paid'
          ) THEN 'completed'
          ELSE 'active'
        END,
        updated_at = now()
    WHERE pp.id = ANY(v_plan_ids)
      AND pp.status <> 'cancelled';
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

COMMIT;
