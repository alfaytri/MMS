-- Fix: submit_credit_group_change required all 3 docs (CR, Establishment ID,
-- Signed Credit Form) regardless of entity_type. Individuals only need the
-- Signed Credit Form; only business entities need all three.
--
-- Also: reject_credit_group_change now unblocks new customers on rejection
-- instead of leaving them permanently blocked.

BEGIN;

-- ── 1. submit: entity-aware doc validation ────────────────────────────────

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

  SELECT id, credit_group_id, entity_type,
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

  -- Doc gate: business needs all 3, individual needs only signed credit form
  IF COALESCE(v_customer.entity_type, 'individual') = 'business' THEN
    IF v_customer.cr_url IS NULL
       OR v_customer.establishment_id_url IS NULL
       OR v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload all 3 required docs (CR, Establishment ID, Signed Credit Form) for business customers'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_customer.signed_credit_form_url IS NULL THEN
      RAISE EXCEPTION 'Upload the Signed Credit Form before requesting a credit group'
        USING ERRCODE = 'P0001';
    END IF;
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
    -- No steps configured → auto-approve
    UPDATE customers
       SET credit_group_id = p_requested_group_id,
           customer_type   = 'credit',
           is_blocked      = false,
           block_reason    = NULL
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

-- ── 2. reject: unblock customer on rejection ──────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_credit_group_change(
  p_approval_id uuid,
  p_reason      text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row        RECORD;
  v_request    RECORD;
  v_profile_id uuid;
  v_full_name  TEXT;
BEGIN
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting';
  END IF;

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

  -- Mark this step as rejected
  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  -- Cancel all sibling pending steps in the same iteration
  UPDATE customer_credit_group_approvals
  SET    status    = 'rejected',
         reason    = 'Cancelled — sibling step rejected',
         is_active = false
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  -- Close the request as rejected
  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = v_row.request_id FOR UPDATE;

  UPDATE customer_credit_group_requests
     SET status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  -- Unblock customer (if they were blocked for pending approval)
  UPDATE customers
     SET is_blocked   = false,
         block_reason = NULL
   WHERE id = v_request.customer_id
     AND is_blocked   = true
     AND block_reason = 'Pending credit group approval';

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Rejected',
    'customers',
    'customer',
    v_request.customer_id,
    v_full_name,
    'warning',
    jsonb_build_object(
      'request_id', v_request.id,
      'step_role',  v_row.step_role,
      'reason',     p_reason
    )::text
  );
END;
$$;

-- ── 3. Unblock Test 4 and any other stuck customers ───────────────────────

UPDATE customers
   SET is_blocked   = false,
       block_reason = NULL
 WHERE is_blocked   = true
   AND block_reason = 'Pending credit group approval'
   AND NOT EXISTS (
     SELECT 1 FROM customer_credit_group_requests
     WHERE customer_id = customers.id AND status = 'pending'
   );

NOTIFY pgrst, 'reload schema';

COMMIT;
