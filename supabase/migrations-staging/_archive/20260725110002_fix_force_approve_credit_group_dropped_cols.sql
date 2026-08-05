-- Out-of-band fix for force_approve_credit_group_change:
-- - referenced dropped columns customers.customer_type (dropped in
--   20260724170001) and customers.is_blocked (dropped in 20260724240000)
-- - still went through the profiles compat view
-- Handover missed this RPC when the sibling approve/reject/submit were cleaned.
BEGIN;

CREATE OR REPLACE FUNCTION public.force_approve_credit_group_change(
  p_request_id uuid,
  p_comment    text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id   uuid;
  v_full_name    TEXT;
  v_is_owner     BOOLEAN;
  v_request      RECORD;
  v_iteration    INT;
  v_count        INT;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.name             = 'Owner'
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only users with the Owner role can force-approve';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit-group request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending (status: %)', v_request.status;
  END IF;

  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM   customer_credit_group_approvals
  WHERE  request_id = p_request_id;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         force_approved  = true,
         force_comment   = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
         comment         = COALESCE(comment, p_comment)
  WHERE  request_id = p_request_id
    AND  iteration  = v_iteration
    AND  status     = 'pending'
    AND  is_active  = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No pending steps to force-approve on this request';
  END IF;

  -- customer_type and is_blocked columns were dropped; both are derived now
  -- (customer_type from credit_group_id IS NULL, is_blocked from block_reason
  -- IS NOT NULL). Only the group id and unblock reason need updating.
  UPDATE customers
     SET credit_group_id = v_request.requested_group_id,
         block_reason    = NULL
   WHERE id = v_request.customer_id;

  UPDATE customer_credit_group_requests
     SET status     = 'approved',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.activity_log (
    action, module, entity_type, entity_id, performer_name, severity, details
  ) VALUES (
    'Credit Group Change Force-Approved',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'critical',
    jsonb_build_object(
      'request_id',     v_request.id,
      'iteration',      v_iteration,
      'forced_count',   v_count,
      'force_comment',  NULLIF(TRIM(COALESCE(p_comment, '')), '')
    )::text
  );

  RETURN v_count;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
