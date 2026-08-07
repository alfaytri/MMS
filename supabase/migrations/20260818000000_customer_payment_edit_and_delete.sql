-- Customer (AR) payment edit + hard-delete RPCs — mirror of the supplier
-- side shipped in 20260817000000 + 20260817010000.
--
-- Fills the AR-side correction gap. The AR side already has
-- `detach_payment_from_invoice` (unlink only), but no way to edit the
-- amount / method / date / reference or fully delete a mistaken row.
-- The mirror preserves the same guarantees:
--
--   • SECURITY DEFINER, enforce `sales.payments.manage` in-body so
--     clients can't skip the permission gate.
--   • Direction must be 'incoming'.
--   • Refuse `credit_note_id IS NOT NULL` — store-credit redemptions
--     flow through `rpc_redeem_credit_note` and reversing one requires
--     unwinding CN balance, which is out of scope for this task.
--   • Existing `invoice_recompute_paid_trg` on payments already
--     recalculates so_invoices.paid_amount + payment_status on UPDATE
--     and DELETE (invoice_recompute_paid_fn last touched in
--     20260723100000). The `sale_order_paid_summary` view is
--     compute-on-demand.
--   • Installment reversal identical to AP: `payment_installments.payment_id`
--     links installments to their settling payment; edit shifts
--     paid_amount by the delta, delete clears the link + restores the
--     amount + un-completes the plan when the last paid installment is
--     reversed. Cancelled plans stay cancelled.
--
-- Note: multi-allocation guard is intentionally absent — the AR side
-- does not use `payment_bill_allocations` (that table is bill-only).

BEGIN;

-- ─── Edit ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_edit_customer_payment(
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
  v_rate       numeric;
  v_old_amount numeric;
  v_plan_ids   uuid[];
  v_inst_ids   uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'sales.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: sales.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is already deleted', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  IF v_row.direction <> 'incoming' THEN
    RAISE EXCEPTION 'Only incoming (customer) payments can be edited here' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.credit_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'Credit-note redemptions cannot be edited directly — void and re-issue via the credit-note flow'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_old_amount := v_row.amount;

  -- Currency + exchange_rate handling. If caller passed a rate, honour it;
  -- otherwise keep the stored rate. QAR always locks to 1.
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

  -- Installment linkage: shift paid_amount by delta, recompute status,
  -- re-derive plan state. Only the affected installments are touched.
  SELECT array_agg(DISTINCT plan_id), array_agg(id)
  INTO v_plan_ids, v_inst_ids
  FROM public.payment_installments
  WHERE payment_id = p_payment_id;

  IF v_plan_ids IS NOT NULL THEN
    UPDATE public.payment_installments
    SET paid_amount = GREATEST(0, paid_amount + (p_amount - v_old_amount)),
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

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_edit_customer_payment(uuid, numeric, text, date, text, text, numeric)
  TO authenticated;

-- ─── Delete (soft) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_customer_payment(p_payment_id uuid)
RETURNS public.payments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      public.payments;
  v_actor    uuid;
  v_plan_ids uuid[];
  v_inst_ids uuid[];
BEGIN
  v_actor := public._current_user_data_id();
  IF NOT public._user_has_permission(v_actor, 'sales.payments.manage') THEN
    RAISE EXCEPTION 'Permission denied: sales.payments.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    -- Idempotent.
    RETURN v_row;
  END IF;
  IF v_row.direction <> 'incoming' THEN
    RAISE EXCEPTION 'Only incoming (customer) payments can be deleted here' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.credit_note_id IS NOT NULL THEN
    RAISE EXCEPTION 'Credit-note redemptions cannot be deleted directly — void via the credit-note flow'
      USING ERRCODE = 'P0001';
  END IF;

  -- Installment reversal: capture ids BEFORE clearing payment_id, then
  -- reverse the settled amount and re-derive installment + plan state.
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

  UPDATE public.payments
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_delete_customer_payment(uuid)
  TO authenticated;

COMMIT;
