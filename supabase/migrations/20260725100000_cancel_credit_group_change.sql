-- cancel_credit_group_change: requester (or admin) withdraws a pending
-- credit-group change request. Marks all still-pending steps as cancelled,
-- unblocks the customer if auto-blocked, writes activity log.
BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_credit_group_change(
  p_request_id uuid,
  p_reason     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  text;
  v_is_admin   boolean;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled (current: %)', v_request.status;
  END IF;

  -- Requester or admin may cancel. Admin = has any role flagged is_approval_slot
  -- with the credit_group scope (same gate rejection uses).
  SELECT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id      = v_profile_id
      AND  cr.is_approval_slot = true
      AND  cr.deleted_at       IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) INTO v_is_admin;

  IF v_request.requested_by <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the requester or an approver can cancel this request';
  END IF;

  UPDATE customer_credit_group_requests
     SET status     = 'cancelled',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  UPDATE customer_credit_group_approvals
     SET status    = 'rejected',
         reason    = COALESCE(NULLIF(TRIM(p_reason), ''), 'Request cancelled by requester'),
         is_active = false
   WHERE request_id = v_request.id
     AND status     = 'pending';

  -- Unblock customer if the block was tied to this pending request
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Cancelled',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'info',
    jsonb_build_object(
      'request_id', v_request.id,
      'reason',     COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by requester')
    )::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_credit_group_change(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
