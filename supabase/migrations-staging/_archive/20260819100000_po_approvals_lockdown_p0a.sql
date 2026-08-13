-- Security remediation P0a — close finding A: direct client INSERT/DELETE on
-- po_approvals (approval-chain forgery / bypass).
--
-- Before: authenticated held direct INSERT + DELETE on po_approvals under an
-- ALL policy `USING(true)`. The client built the approval steps itself
-- (findApplicableTiers + buildApprovalSteps in JS) and inserted them, and could
-- delete steps directly. A malicious client could therefore (a) substitute a
-- WEAKER chain (fewer/self-held tiers) so its own PO self-approves, or (b) delete
-- other tiers' pending steps to defeat multi-party approval, or (c) forge rows.
--
-- Fix: the step set is now DERIVED SERVER-SIDE from the authoritative tier config
-- inside a SECURITY DEFINER RPC (the client can no longer choose the tiers), and
-- clearing steps goes through a second DEFINER RPC; direct client INSERT/DELETE
-- is revoked and the ALL `USING(true)` policy is narrowed to SELECT-only.
--
-- The identity/role hardening of the APPROVE/REJECT path (po_approval_action)
-- shipped earlier (589bf3de); the PO status-transition guard shipped in 49d15dce.
-- This migration closes the remaining po_approvals write vector.
--
-- Live-verified before writing (staging mwvblpgbgxipvrevkeff, 2026-08-09):
--  * po_approvals cols: po_id, role text, status enum, tier_rank int, is_active
--    bool, iteration int, approved_by text, ... (approved_by/date set only by the
--    DEFINER approve RPC; the build RPC leaves them NULL).
--  * po_approval_chain_tiers: chain_id, rank, min_amount, max_amount,
--    required_roles text[], deleted_at. po_approval_chains: division_id, is_active,
--    archived_at.
--  * Tier rule (mirrors findApplicableTiers): tiers with deleted_at IS NULL AND
--    min_amount <= total_qar, ordered by rank; one pending step per required role
--    (buildApprovalSteps). Iteration = max(existing)+1 (submit keeps past
--    iterations → increments; resubmit clears all first → 1).
--  * Only 4 client writers (usePurchaseOrders.ts:596/982 insert, 785/919 delete)
--    — all refactored to these RPCs in the same change.
--  * is_division_visible(uuid) exists; auth.uid() resolves the caller inside a
--    DEFINER function (reads the request JWT, not current_user).

-- 1. Build the approval steps for a PO, server-side. Used by submit + resubmit.
CREATE OR REPLACE FUNCTION public.rpc_build_po_approval_steps(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_po        RECORD;
  v_chain_id  uuid;
  v_iteration int;
  v_count     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_qar, division_id, status
    INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: PO % not found', p_po_id;
  END IF;

  -- Caller must be able to see the PO's division (mirrors the row-visibility
  -- model). Legacy NULL-division POs are not gated on visibility.
  IF v_po.division_id IS NOT NULL AND NOT public.is_division_visible(v_po.division_id) THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authorized for this PO' USING ERRCODE = '42501';
  END IF;

  -- Active chain: PO division first, else company-default (NULL division).
  SELECT id INTO v_chain_id
    FROM po_approval_chains
   WHERE is_active AND archived_at IS NULL AND division_id = v_po.division_id
   LIMIT 1;
  IF v_chain_id IS NULL THEN
    SELECT id INTO v_chain_id
      FROM po_approval_chains
     WHERE is_active AND archived_at IS NULL AND division_id IS NULL
     LIMIT 1;
  END IF;
  IF v_chain_id IS NULL THEN
    RAISE EXCEPTION 'No approval chain configured for this PO.';
  END IF;

  v_iteration := COALESCE((SELECT max(iteration) FROM po_approvals WHERE po_id = p_po_id), 0) + 1;

  -- Derive steps from the authoritative tier config: every tier whose
  -- min_amount <= the PO total, one pending step per required role.
  INSERT INTO po_approvals (po_id, role, tier_rank, status, is_active, iteration)
  SELECT p_po_id, r.role, t.rank, 'pending', true, v_iteration
    FROM po_approval_chain_tiers t
    CROSS JOIN LATERAL unnest(t.required_roles) AS r(role)
   WHERE t.chain_id      = v_chain_id
     AND t.deleted_at    IS NULL
     AND t.min_amount    <= COALESCE(v_po.total_qar, 0);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No approval tiers match this PO amount. Check the approval chain configuration.';
  END IF;

  RETURN jsonb_build_object('iteration', v_iteration, 'step_count', v_count);
END;
$function$;

-- 2. Clear a PO's approval steps, server-side. p_only_pending=true for recall
--    (leave past approved/rejected rows for audit), false for resubmit (wipe all).
CREATE OR REPLACE FUNCTION public.rpc_clear_po_approval_steps(p_po_id uuid, p_only_pending boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_div uuid;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, true INTO v_div, v_found FROM purchase_orders WHERE id = p_po_id;
  IF NOT v_found THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: PO % not found', p_po_id;
  END IF;
  IF v_div IS NOT NULL AND NOT public.is_division_visible(v_div) THEN
    RAISE EXCEPTION 'rpc_clear_po_approval_steps: not authorized for this PO' USING ERRCODE = '42501';
  END IF;

  IF p_only_pending THEN
    DELETE FROM po_approvals WHERE po_id = p_po_id AND status = 'pending';
  ELSE
    DELETE FROM po_approvals WHERE po_id = p_po_id;
  END IF;
END;
$function$;

-- 3. Remove direct client write access; funnel all writes through the DEFINER
--    RPCs (build/clear) + the existing approve/reject RPC (po_approval_action).
REVOKE INSERT, DELETE ON public.po_approvals FROM authenticated;

-- 4. Narrow the blanket ALL/USING(true) policy to SELECT-only. Writes now happen
--    exclusively inside SECURITY DEFINER RPCs (which bypass RLS); with INSERT/
--    DELETE/UPDATE grants gone, the write paths are unreachable regardless.
DROP POLICY IF EXISTS "Internal users can manage po_approvals" ON public.po_approvals;
CREATE POLICY po_approvals_select ON public.po_approvals
  FOR SELECT TO authenticated USING (true);
