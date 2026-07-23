-- Sales Approval — role + scope guard for approve/reject RPCs.
--
-- Background: the original approve_sales_request / reject_sales_request only
-- checked four-eyes (caller hasn't already decided another row in this
-- iteration). The UI hook usePendingSalesApprovals filters slips by the
-- caller's roles + scopes before showing them, but the SQL itself never
-- verified that the caller actually held the role named in step_role with
-- the matching scope (sales_margin / sales_credit). A user with the anon
-- key could bypass the UI filter and approve any slip via direct RPC call.
--
-- This migration replaces both functions to enforce the role+scope check
-- server-side. Behaviour change for legitimate users: none (the UI already
-- only surfaces slips they have the role for). Behaviour change for crafted
-- direct RPC calls: hard-fail with a clear message.
BEGIN;

-- ─── approve_sales_request ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_sales_request(
  p_request_id uuid,
  p_comment    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  -- Role + scope guard: caller must hold an approval-slot role named step_role
  -- with either NULL (all scopes) or the matching sales scope in approval_scopes.
  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  -- Four-eyes guard: same user must not approve two roles in the same iteration
  IF EXISTS (
    SELECT 1 FROM approval_requests
    WHERE  source_id     = v_req.source_id
      AND  approval_type = v_req.approval_type
      AND  iteration     = v_req.iteration
      AND  decided_by    = v_profile_id
      AND  id            <> p_request_id
  ) THEN
    RAISE EXCEPTION 'You have already approved another role on this slip';
  END IF;

  UPDATE approval_requests
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         comment         = p_comment
  WHERE  id = p_request_id;

  PERFORM public.advance_sales_approval(v_req.source_id, v_req.approval_type);
END;
$$;

-- ─── reject_sales_request ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_sales_request(
  p_request_id uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
  v_scope       TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  v_scope := CASE v_req.approval_type
    WHEN 'margin' THEN 'sales_margin'
    WHEN 'credit' THEN 'sales_credit'
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'Unknown sales approval type %', v_req.approval_type;
  END IF;

  -- Role + scope guard (same as approve)
  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_req.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR v_scope = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required to reject this approval step';
  END IF;

  -- Mark this row rejected
  UPDATE approval_requests
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         reason          = p_reason
  WHERE  id = p_request_id;

  -- Mark all sibling pending rows in the same iteration as rejected too
  -- (the salesperson must fix the SO before any further review)
  UPDATE approval_requests
  SET    status   = 'rejected',
         reason   = 'Cancelled — sibling step rejected'
  WHERE  source_id     = v_req.source_id
    AND  approval_type = v_req.approval_type
    AND  iteration     = v_req.iteration
    AND  status        = 'pending'
    AND  id            <> p_request_id;

  -- Bounce SO back to quotation so it can be edited and resubmitted
  UPDATE sale_orders SET status = 'quotation' WHERE id = v_req.source_id;
END;
$$;

COMMIT;
