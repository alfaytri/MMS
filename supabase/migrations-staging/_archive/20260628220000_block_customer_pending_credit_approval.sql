-- Block new customers while their credit group approval is pending.
-- "New" = previous_group_id IS NULL (customer was just created, not changing groups).
-- On approve / force-approve: unblock. On reject: keep blocked (admin can unblock manually).

BEGIN;

-- ── 1. submit: block new customers on request creation ─────────────────────

CREATE OR REPLACE FUNCTION public.submit_credit_group_change(
  p_customer_id        uuid,
  p_requested_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer        RECORD;
  v_new_group       RECORD;
  v_profile_id      uuid;
  v_request_id      uuid;
  v_step            RECORD;
  v_step_count      integer := 0;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT id, credit_group_id,
         cr_url,
         establishment_id_url,
         signed_credit_form_url
    INTO v_customer
  FROM customers
  WHERE id = p_customer_id;
  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT id, name, credit_limit INTO v_new_group
  FROM credit_groups WHERE id = p_requested_group_id;
  IF v_new_group.id IS NULL THEN
    RAISE EXCEPTION 'Credit group not found';
  END IF;

  IF COALESCE(v_new_group.credit_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Approval only required for credit groups with a non-zero limit. Assign this group directly.';
  END IF;

  IF v_customer.credit_group_id = p_requested_group_id THEN
    RAISE EXCEPTION 'Customer is already on this credit group';
  END IF;

  IF v_customer.cr_url IS NULL
     OR v_customer.establishment_id_url IS NULL
     OR v_customer.signed_credit_form_url IS NULL THEN
    RAISE EXCEPTION 'Upload all 3 required docs first (CR, Establishment ID, Signed Credit Form)'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_requests
    WHERE customer_id = p_customer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending credit-group change for this customer';
  END IF;

  INSERT INTO customer_credit_group_requests (
    customer_id, requested_group_id, previous_group_id, status, requested_by
  ) VALUES (
    p_customer_id, p_requested_group_id, v_customer.credit_group_id, 'pending', v_profile_id
  )
  RETURNING id INTO v_request_id;

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles            cr ON cr.id = was.role_id
    WHERE  was.workflow    = 'credit_group'
      AND  was.is_active   = true
      AND  was.archived_at IS NULL
    ORDER BY was.step_order
  LOOP
    INSERT INTO customer_credit_group_approvals (
      request_id, step_role, step_order, status, is_active, iteration
    ) VALUES (
      v_request_id, v_step.role_name, v_step.step_order, 'pending', true, 1
    );
    v_step_count := v_step_count + 1;
  END LOOP;

  IF v_step_count = 0 THEN
    UPDATE customers SET credit_group_id = p_requested_group_id,
                         is_blocked = false, block_reason = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET is_blocked   = true,
             block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM profiles WHERE id = v_profile_id),
    'info',
    jsonb_build_object(
      'request_id',       v_request_id,
      'requested_group',  v_new_group.name,
      'previous_group_id',v_customer.credit_group_id,
      'auto_approved',    v_step_count = 0
    )::text
  );

  RETURN jsonb_build_object(
    'request_id',  v_request_id,
    'step_count',  v_step_count,
    'status',      CASE WHEN v_step_count = 0 THEN 'approved' ELSE 'pending' END
  );
END;
$$;

-- ── 2. approve: unblock customer on full chain completion ──────────────────

CREATE OR REPLACE FUNCTION public.approve_credit_group_change(
  p_approval_id uuid,
  p_comment     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row            RECORD;
  v_request        RECORD;
  v_profile_id     uuid;
  v_full_name      TEXT;
  v_all_done       BOOLEAN;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name
  FROM   profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Caller profile not found';
  END IF;

  SELECT * INTO v_row FROM customer_credit_group_approvals
    WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'pending' OR NOT v_row.is_active THEN
    RAISE EXCEPTION 'Approval step not actionable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_custom_roles ucr
    JOIN   custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id        = v_profile_id
      AND  cr.name               = v_row.step_role
      AND  cr.is_approval_slot   = true
      AND  cr.deleted_at         IS NULL
      AND  (ucr.approval_scopes IS NULL
            OR 'credit_group' = ANY(ucr.approval_scopes))
  ) THEN
    RAISE EXCEPTION 'You do not hold the role required for this approval step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  decided_by  = v_profile_id
      AND  id          <> p_approval_id
  ) THEN
    RAISE EXCEPTION 'You have already actioned another step on this request';
  END IF;

  UPDATE customer_credit_group_approvals
  SET    status          = 'approved',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         comment         = p_comment
  WHERE  id = p_approval_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM customer_credit_group_approvals
    WHERE  request_id  = v_row.request_id
      AND  iteration   = v_row.iteration
      AND  status     <> 'approved'
  ) INTO v_all_done;

  IF v_all_done THEN
    SELECT * INTO v_request FROM customer_credit_group_requests
      WHERE id = v_row.request_id FOR UPDATE;

    UPDATE customers
       SET credit_group_id = v_request.requested_group_id,
           is_blocked      = false,
           block_reason    = NULL
     WHERE id = v_request.customer_id;

    UPDATE customer_credit_group_requests
       SET status     = 'approved',
           decided_by = v_profile_id,
           decided_at = now()
     WHERE id = v_request.id;

    INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
    VALUES (
      'Credit Group Change Approved',
      'customers',
      'customer',
      v_request.customer_id,
      v_full_name,
      'info',
      jsonb_build_object('request_id', v_request.id)::text
    );
  END IF;
END;
$$;

-- ── 3. force-approve: unblock customer ─────────────────────────────────────

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
  FROM   profiles WHERE auth_user_id = auth.uid();
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

  UPDATE customers
     SET credit_group_id = v_request.requested_group_id,
         is_blocked      = false,
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
