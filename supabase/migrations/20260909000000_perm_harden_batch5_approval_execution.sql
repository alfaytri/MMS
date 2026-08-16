-- Batch 5 — approval-EXECUTION hardening (stock-adjustment + advance mutators).
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md (§ Approval-execution).
--
-- Unlike batches 2–4 (coarse .create/.manage guards), the approval actions must
-- verify the caller is *the authorized approver*, so the model is role/scope based.
-- Investigation found the client-facing PO + sales actions already do this
-- correctly (po_approval_action / approve_sales_request / reject_sales_request /
-- force_approve_sales_request / force_approve_stock_adjustment all derive identity
-- from auth.uid() and check the step role / Owner). Two classes of hole remain:
--
--   HOLE 1 — action_stock_adjustment_step authorized on a CLIENT-SUPPLIED
--   p_profile_id, so any caller could pass a victim's profile_id (who holds the
--   step role) and forge an approval in their name. Rewritten below to derive the
--   real caller from auth.uid() and use that for both the authz check and the
--   attribution; the p_profile_* args are now ignored (kept only for signature
--   compatibility — the frontend already passes the current user's own values).
--
--   HOLES 2–4 — approve_stock_adjustment_inventory / advance_sales_approval /
--   advance_po_approval_tier are SECURITY DEFINER state-mutators (post inventory /
--   FIFO / cost, or flip PO->approved / SO->confirmed) that were directly
--   EXECUTE-able by `authenticated` with NO caller authorization. They are only
--   ever invoked internally by the gated DEFINER functions above; a direct call
--   bypasses the whole chain. All three are owned by `postgres`, so revoking the
--   `authenticated` grant closes the attack surface WITHOUT breaking the internal
--   PERFORM calls (inside a DEFINER function the effective user is the owner).
--   Verified: 0 client call-sites; no trigger/other function calls them.

-- ── HOLE 1: derive the approver identity from the JWT, never the client args ──
CREATE OR REPLACE FUNCTION public.action_stock_adjustment_step(p_step_id uuid, p_action text, p_profile_id uuid, p_profile_name text, p_notes text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_step          RECORD;
  v_warehouse_id  UUID;
  v_remaining     INTEGER;
  -- Real caller identity, derived from the JWT. The p_profile_* args are
  -- untrusted client input and are NEVER used for authorization or attribution.
  v_caller_id     UUID;
  v_caller_name   TEXT;
BEGIN
  IF p_action NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'p_action must be approved or rejected';
  END IF;

  SELECT id, COALESCE(NULLIF(TRIM(full_name), ''), email)
    INTO v_caller_id, v_caller_name
    FROM user_data
   WHERE auth_user_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for the authenticated user';
  END IF;

  IF p_action = 'rejected' AND COALESCE(TRIM(p_notes), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting an approval step';
  END IF;

  SELECT *
  INTO   v_step
  FROM   stock_adjustment_approvals
  WHERE  id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval step not found';
  END IF;

  IF v_step.status <> 'pending' THEN
    RAISE EXCEPTION 'Step is not pending (current status: %)', v_step.status;
  END IF;

  SELECT warehouse_id
  INTO   v_warehouse_id
  FROM   stock_adjustments
  WHERE  id = v_step.adjustment_id;

  -- AUTHZ: the REAL caller must hold this step's role (or be the warehouse RP).
  IF NOT user_can_action_adjustment_step(v_caller_id, v_step.step_role, v_warehouse_id) THEN
    RAISE EXCEPTION 'You do not have the % role required to action this step', v_step.step_label;
  END IF;

  UPDATE stock_adjustment_approvals
  SET    status       = p_action,
         profile_id   = v_caller_id,
         profile_name = v_caller_name,
         action_at    = now(),
         notes        = NULLIF(p_notes,'')
  WHERE  id = p_step_id;

  IF p_action = 'rejected' THEN
    UPDATE stock_adjustment_approvals
    SET    status = 'rejected',
           notes  = 'Auto-rejected due to previous step rejection'
    WHERE  adjustment_id = v_step.adjustment_id
      AND  status = 'pending'
      AND  id <> p_step_id;

    UPDATE stock_adjustments
    SET    status            = 'rejected',
           approved_by_name  = v_caller_name,
           approved_at       = now(),
           updated_at        = now()
    WHERE  id = v_step.adjustment_id;

    RETURN 'chain_rejected';
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM   stock_adjustment_approvals
  WHERE  adjustment_id = v_step.adjustment_id
    AND  status = 'pending';

  IF v_remaining = 0 THEN
    PERFORM approve_stock_adjustment_inventory(
      p_adjustment_id => v_step.adjustment_id,
      p_approved_by   => v_caller_name
    );
    RETURN 'chain_completed';
  END IF;

  RETURN 'step_approved';
END;
$function$;

-- ── HOLES 2–4: internal-only orchestration mutators — remove direct grants ───
REVOKE ALL ON FUNCTION public.approve_stock_adjustment_inventory(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.advance_sales_approval(uuid, approval_type)    FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.advance_po_approval_tier(uuid)                 FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
