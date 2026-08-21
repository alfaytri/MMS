-- B4 (go-live blocker): close the sales credit-limit bypass via
-- "Save as Quotation" -> "Confirm".
--
-- Before: useConfirmSO wrote sale_orders.status='confirmed' directly, and
-- guard_so_privileged_status ALLOWED a direct authenticated write to
-- 'confirmed'. The credit check lives only in create_sale_order (intent=
-- 'confirm'), so a salesperson could save an over-limit credit customer's
-- order as a quotation (no gate) then Confirm it in one click — skipping the
-- whole credit-approval chain and auto-creating the AR invoice.
--
-- Fix, two parts:
--   1. New SECURITY DEFINER RPC confirm_sale_order(p_so_id) that re-runs the
--      same credit check as create_sale_order: an over-available-limit credit
--      customer is diverted to 'pending_approval' + build_sales_approval_chain;
--      otherwise the SO is 'confirmed'. Cash customers always confirm.
--   2. Tighten guard_so_privileged_status: drop 'confirmed' from the set of
--      statuses an authenticated client may set directly (only 'cancelled'
--      stays a direct client transition). Every confirm now MUST route through
--      the DEFINER RPC (which bypasses the guard via current_user), so a direct
--      PATCH status='confirmed' via PostgREST is refused.
--
-- The credit math + build_sales_approval_chain call mirror create_sale_order
-- verbatim (live body = migration 20260819120000; verified no later migration
-- redefines public.create_sale_order, so that body is current).

BEGIN;

-- 1. Confirm RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_sale_order(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id   uuid;
  v_status        sale_order_status;
  v_total         numeric;
  v_total_qar     numeric;
  v_rate          numeric;
  v_is_cash       boolean;
  v_credit_limit  numeric;
  v_open_total    numeric;
  v_available     numeric := 0;
  v_new_status    sale_order_status;
  v_profile_id    uuid;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();

  -- Read the SO first (need customer_id), then serialize per-customer exactly
  -- like create_sale_order so the credit check can't race a concurrent order
  -- for the same customer.
  SELECT customer_id, status, total, total_qar, initial_exchange_rate
    INTO v_customer_id, v_status, v_total, v_total_qar, v_rate
  FROM sale_orders WHERE id = p_so_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Sale order not found';
  END IF;

  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(v_customer_id::text), 1, 15))::bit(60)::bigint
  );

  -- Re-read status under the lock (TOCTOU): only a quotation can be confirmed.
  SELECT status INTO v_status FROM sale_orders WHERE id = p_so_id FOR UPDATE;
  IF v_status <> 'quotation'::sale_order_status THEN
    RAISE EXCEPTION 'Only a quotation can be confirmed (current status: %)', v_status
      USING ERRCODE = '42501';
  END IF;

  v_total_qar := COALESCE(v_total_qar, v_total * COALESCE(v_rate, 1), 0);

  SELECT (c.credit_group_id IS NULL), cg.credit_limit
    INTO v_is_cash, v_credit_limit
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = v_customer_id;

  IF v_is_cash THEN
    v_new_status := 'confirmed'::sale_order_status;
  ELSE
    IF v_credit_limit IS NULL THEN
      RAISE EXCEPTION 'no_credit_group';
    END IF;
    v_open_total := public.customer_credit_used(v_customer_id, NULL);
    v_available  := v_credit_limit - v_open_total;
    v_new_status := CASE
      WHEN v_total_qar > v_available THEN 'pending_approval'::sale_order_status
      ELSE                                'confirmed'::sale_order_status
    END;
  END IF;

  UPDATE sale_orders SET status = v_new_status WHERE id = p_so_id;

  IF v_new_status = 'pending_approval'::sale_order_status THEN
    PERFORM public.build_sales_approval_chain(
      p_so_id, 'credit',
      jsonb_build_object(
        'available',    GREATEST(v_available, 0),
        'overage',      v_total_qar - v_available,
        'requested_by', v_profile_id
      )
    );
  END IF;

  RETURN jsonb_build_object('status', v_new_status, 'so_id', p_so_id);
END;
$function$;

-- SECURITY DEFINER functions in public are EXECUTE-able by PUBLIC (hence anon)
-- by default — lock it to authenticated callers (project anon-hardening rule).
REVOKE EXECUTE ON FUNCTION public.confirm_sale_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sale_order(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.confirm_sale_order(uuid) TO authenticated;

-- 2. Tighten the status guard ----------------------------------------------
-- 'confirmed' is no longer a legal DIRECT client transition — it must go
-- through confirm_sale_order (DEFINER). Only 'cancelled' stays a direct client
-- transition (useCancelSO). Body reproduced from 20260819110000; the ONLY
-- change is dropping 'confirmed' from the allowed UPDATE set.
CREATE OR REPLACE FUNCTION public.guard_so_privileged_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER workflow RPCs (and the
  -- service role) run as a non-client role and are the only legitimate source
  -- of a workflow status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('quotation', 'pending_approval') THEN
      RAISE EXCEPTION 'A sale order cannot be created with status "%" — that is set by the workflow.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- 'confirmed' now routes through confirm_sale_order (credit gate); only
    -- 'cancelled' remains a direct client transition.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status <> 'cancelled'::sale_order_status THEN
      RAISE EXCEPTION 'Sale order status "%" can only be set by the confirm/delivery/invoice/approval workflow, not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger trg_guard_so_privileged_status already exists and stays bound to the
-- replaced function — no trigger change needed.

NOTIFY pgrst, 'reload schema';

COMMIT;
