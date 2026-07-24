-- Customers table cleanup:
--   1. entity_type text+CHECK → proper enum public.customer_entity_type
--   2. Drop customers.is_blocked — derivable from block_reason IS NOT NULL,
--      same redundancy pattern the customer_type drop already fixed.
--
-- customer_credit_summary view depends on is_blocked; rebuild it with
-- is_blocked as a derived boolean so no client-side code has to change.
--
-- Three RPCs (submit / approve / reject credit-group changes) currently
-- write is_blocked and — from before the customer_type drop — also
-- referenced customer_type. Rewriting them here removes both.

BEGIN;

-- ─── 1. entity_type → enum ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_entity_type') THEN
    CREATE TYPE public.customer_entity_type AS ENUM ('individual', 'business');
  END IF;
END $$;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_entity_type_check;

ALTER TABLE public.customers
  ALTER COLUMN entity_type DROP DEFAULT;

ALTER TABLE public.customers
  ALTER COLUMN entity_type TYPE public.customer_entity_type
  USING entity_type::public.customer_entity_type;

ALTER TABLE public.customers
  ALTER COLUMN entity_type SET DEFAULT 'individual'::public.customer_entity_type;

-- ─── 2. Drop the summary view (depends on is_blocked) ───────────────────

DROP VIEW IF EXISTS public.customer_credit_summary;

-- ─── 3. Drop is_blocked column ──────────────────────────────────────────

ALTER TABLE public.customers
  DROP COLUMN IF EXISTS is_blocked;

-- ─── 4. Recreate the view with is_blocked as a derived boolean ──────────

CREATE VIEW public.customer_credit_summary
WITH (security_invoker = on) AS
SELECT
  c.id                                              AS customer_id,
  c.name                                            AS customer_name,
  c.name_ar                                         AS customer_name_ar,
  CASE
    WHEN c.credit_group_id IS NULL THEN 'cash'
    ELSE 'credit'
  END                                               AS customer_type,
  (c.block_reason IS NOT NULL)                      AS is_blocked,
  c.credit_group_id                                 AS credit_group_id,
  cg.name                                           AS credit_group_name,
  CASE
    WHEN c.credit_group_id IS NULL THEN 0
    ELSE COALESCE(cg.credit_limit, 0)
  END                                               AS credit_limit,
  public.customer_credit_used(c.id, NULL)           AS credit_used,
  GREATEST(
    CASE
      WHEN c.credit_group_id IS NULL THEN 0
      ELSE COALESCE(cg.credit_limit, 0)
    END
    - public.customer_credit_used(c.id, NULL),
    0
  )                                                 AS credit_available,
  CASE
    WHEN COALESCE(
           CASE WHEN c.credit_group_id IS NULL THEN 0
                ELSE COALESCE(cg.credit_limit, 0) END,
           0) = 0
      THEN NULL
    ELSE LEAST(
      ROUND(
        public.customer_credit_used(c.id, NULL)
        / NULLIF(CASE
                   WHEN c.credit_group_id IS NULL THEN 0
                   ELSE COALESCE(cg.credit_limit, 0)
                 END, 0)
        * 100, 1),
      100
    )
  END                                               AS credit_utilization_pct
FROM   public.customers c
LEFT   JOIN public.credit_groups cg ON cg.id = c.credit_group_id;

COMMENT ON VIEW public.customer_credit_summary IS
  'Live per-customer credit utilization. customer_type derived from credit_group_id. is_blocked derived from block_reason IS NOT NULL.';

GRANT SELECT ON public.customer_credit_summary TO authenticated, service_role;

-- ─── 5. Rewrite submit_credit_group_change ──────────────────────────────
-- Same body as 20260630121000 minus the customer_type write (column no
-- longer exists) and the is_blocked write (column no longer exists).
-- block_reason is still set/cleared exactly as before so the derived
-- is_blocked flag flips correctly.

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
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
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

  IF COALESCE(v_customer.entity_type::text, 'individual') = 'business' THEN
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
           block_reason    = NULL
     WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  ELSE
    -- Block new customers (no previous group) while approval is pending
    IF v_customer.credit_group_id IS NULL THEN
      UPDATE customers
         SET block_reason = 'Pending credit group approval'
       WHERE id = p_customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  VALUES (
    'Credit Group Change Requested',
    'customers',
    'customer',
    p_customer_id,
    (SELECT full_name FROM user_data WHERE id = v_profile_id),
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

-- ─── 6. Rewrite approve_credit_group_change ─────────────────────────────

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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

-- ─── 7. Rewrite reject_credit_group_change ──────────────────────────────

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
  FROM   user_data WHERE auth_user_id = auth.uid();
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

  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  UPDATE customer_credit_group_approvals
  SET    status    = 'rejected',
         reason    = 'Cancelled — sibling step rejected',
         is_active = false
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  SELECT * INTO v_request FROM customer_credit_group_requests
    WHERE id = v_row.request_id FOR UPDATE;

  UPDATE customer_credit_group_requests
     SET status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
   WHERE id = v_request.id;

  -- Unblock customer (if they were blocked for pending approval)
  UPDATE customers
     SET block_reason = NULL
   WHERE id = v_request.customer_id
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

NOTIFY pgrst, 'reload schema';

COMMIT;

-- NOTE: search_customers RPC still SELECTs c.is_blocked (now dropped) —
-- it is rewritten in the follow-up migration 20260724240001.
