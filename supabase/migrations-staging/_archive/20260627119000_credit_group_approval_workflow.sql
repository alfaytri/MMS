-- ─────────────────────────────────────────────────────────────────────────────
-- Credit Group assignment approval workflow.
--
-- Today: changing a customer's credit_group_id is a direct UPDATE — anyone
-- with master_data.customers.change_credit_group permission can move a
-- customer onto any credit group instantly.
--
-- New: assigning a credit group with a NON-ZERO credit_limit triggers a
-- 3-step approval chain (Purchase Manager → Accountant → Owner). The
-- customer's credit_group_id only flips after the chain fully approves.
-- On reject, the customer stays on whichever group they were on before.
--
-- Reuses the same shape as sale_order_approvals: one request row +
-- per-step rows in customer_credit_group_approvals. Owner step runs in
-- parallel (any-owner-approves).
--
-- Requires the 3 credit docs (CR + Establishment ID + Signed Credit Form)
-- to be uploaded on the customer before submit_credit_group_change accepts
-- the request.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_credit_group_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  requested_group_id    uuid NOT NULL REFERENCES public.credit_groups(id),
  previous_group_id     uuid          REFERENCES public.credit_groups(id),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by          uuid REFERENCES public.profiles(id),
  decided_by            uuid REFERENCES public.profiles(id),
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ccgr_customer_pending_idx
  ON public.customer_credit_group_requests (customer_id)
  WHERE status = 'pending';

ALTER TABLE public.customer_credit_group_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read credit-group requests"
  ON public.customer_credit_group_requests FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.customer_credit_group_requests TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_ccgr_updated_at ON public.customer_credit_group_requests;
CREATE TRIGGER trg_ccgr_updated_at
  BEFORE UPDATE ON public.customer_credit_group_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.customer_credit_group_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES public.customer_credit_group_requests(id) ON DELETE CASCADE,
  step_role       text NOT NULL,
  step_order      integer NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by      uuid REFERENCES public.profiles(id),
  decided_by_name text,
  decided_at      timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  iteration       integer NOT NULL DEFAULT 1,
  comment         text,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ccga_request_idx
  ON public.customer_credit_group_approvals (request_id);
CREATE INDEX IF NOT EXISTS ccga_pending_idx
  ON public.customer_credit_group_approvals (request_id) WHERE status = 'pending' AND is_active;

ALTER TABLE public.customer_credit_group_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read credit-group approval slips"
  ON public.customer_credit_group_approvals FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.customer_credit_group_approvals TO authenticated, service_role;

-- ── 2. Wire 'credit_group' into the existing approval_workflow_steps table ──

ALTER TABLE public.approval_workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_approval_steps_workflow_check;
ALTER TABLE public.approval_workflow_steps
  ADD CONSTRAINT workflow_approval_steps_workflow_check
  CHECK (workflow = ANY (ARRAY[
    'po','inv_check','stock_adj','sales_margin','sales_credit','credit_group'
  ]));

-- Seed the 3 default steps if none exist. Roles must already exist as
-- approval-slot custom_roles — we look them up by name. If a role is
-- missing, the step is skipped silently and the admin can add it from the
-- Approval Workflows page later.
DO $$
DECLARE
  v_role_id     uuid;
  v_role_name   text;
  v_step_order  integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.approval_workflow_steps WHERE workflow = 'credit_group') THEN
    RETURN;
  END IF;
  FOREACH v_role_name IN ARRAY ARRAY['Purchase Manager', 'Accountant', 'Owner']
  LOOP
    SELECT id INTO v_role_id FROM public.custom_roles
      WHERE name = v_role_name
        AND COALESCE(is_approval_slot, false) = true
        AND deleted_at IS NULL
      LIMIT 1;
    IF v_role_id IS NULL THEN CONTINUE; END IF;
    v_step_order := v_step_order + 1;
    INSERT INTO public.approval_workflow_steps (
      workflow, role_id, step_key, step_label, step_order,
      is_conditional, condition_types, is_active
    ) VALUES (
      'credit_group', v_role_id,
      LOWER(REPLACE(v_role_name, ' ', '_')), v_role_name, v_step_order,
      false, ARRAY[]::text[], true
    );
  END LOOP;
END $$;

-- Also extend the user-role assignment scopes so admins can scope a role
-- holder to credit-group approvals specifically (alongside sales_margin /
-- sales_credit).
ALTER TABLE public.user_custom_roles
  DROP CONSTRAINT IF EXISTS user_custom_roles_approval_scopes_chk;
ALTER TABLE public.user_custom_roles
  ADD CONSTRAINT user_custom_roles_approval_scopes_chk
  CHECK (
    approval_scopes IS NULL
    OR approval_scopes <@ ARRAY['po','inv_check','stock_adj','sales_margin','sales_credit','credit_group']::text[]
  );

-- ── 3. RPC: submit_credit_group_change ──────────────────────────────────────
-- Validates: 3 docs uploaded; new group has non-zero limit; no existing
-- pending request. Creates the request + per-step approval rows.

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

  -- Trigger gate: only fire approval for non-zero limit groups
  IF COALESCE(v_new_group.credit_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Approval only required for credit groups with a non-zero limit. Assign this group directly.';
  END IF;

  -- No-op guard
  IF v_customer.credit_group_id = p_requested_group_id THEN
    RAISE EXCEPTION 'Customer is already on this credit group';
  END IF;

  -- Doc gate: all 3 must be uploaded
  IF v_customer.cr_url IS NULL
     OR v_customer.establishment_id_url IS NULL
     OR v_customer.signed_credit_form_url IS NULL THEN
    RAISE EXCEPTION 'Upload all 3 required docs first (CR, Establishment ID, Signed Credit Form)'
      USING ERRCODE = 'P0001';
  END IF;

  -- One-active-request guard
  IF EXISTS (
    SELECT 1 FROM customer_credit_group_requests
    WHERE customer_id = p_customer_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'There is already a pending credit-group change for this customer';
  END IF;

  -- Create the request
  INSERT INTO customer_credit_group_requests (
    customer_id, requested_group_id, previous_group_id, status, requested_by
  ) VALUES (
    p_customer_id, p_requested_group_id, v_customer.credit_group_id, 'pending', v_profile_id
  )
  RETURNING id INTO v_request_id;

  -- Build the chain
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
    -- No steps configured → auto-approve (admin hasn't configured the workflow yet)
    UPDATE customers SET credit_group_id = p_requested_group_id WHERE id = p_customer_id;
    UPDATE customer_credit_group_requests
      SET status = 'approved', decided_by = v_profile_id, decided_at = now()
      WHERE id = v_request_id;
  END IF;

  -- Activity log
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

REVOKE ALL ON FUNCTION public.submit_credit_group_change(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_credit_group_change(uuid, uuid) TO authenticated;

-- ── 4. RPC: approve_credit_group_change ─────────────────────────────────────

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

  -- Role+scope guard
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

  -- Four-eyes
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

  -- Has every step in this iteration been approved?
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
       SET credit_group_id = v_request.requested_group_id
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

REVOKE ALL ON FUNCTION public.approve_credit_group_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_credit_group_change(uuid, text) TO authenticated;

-- ── 5. RPC: reject_credit_group_change ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_credit_group_change(
  p_approval_id uuid,
  p_reason      text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row         RECORD;
  v_profile_id  uuid;
  v_full_name   TEXT;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject';
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
    RAISE EXCEPTION 'You do not hold the role required to reject this step';
  END IF;

  -- Reject this step
  UPDATE customer_credit_group_approvals
  SET    status          = 'rejected',
         decided_by      = v_profile_id,
         decided_by_name = v_full_name,
         decided_at      = now(),
         reason          = p_reason
  WHERE  id = p_approval_id;

  -- Cancel sibling pending steps in same iteration
  UPDATE customer_credit_group_approvals
  SET    status = 'rejected',
         reason = 'Cancelled — sibling step rejected'
  WHERE  request_id = v_row.request_id
    AND  iteration  = v_row.iteration
    AND  status     = 'pending'
    AND  id        <> p_approval_id;

  -- Close the parent request (customer's credit_group stays untouched)
  UPDATE customer_credit_group_requests
  SET    status     = 'rejected',
         decided_by = v_profile_id,
         decided_at = now()
  WHERE  id = v_row.request_id;

  INSERT INTO public.activity_log (action, module, entity_type, entity_id, performer_name, severity, details)
  SELECT
    'Credit Group Change Rejected',
    'customers',
    'customer',
    r.customer_id,
    v_full_name,
    'warning',
    jsonb_build_object('request_id', r.id, 'step_role', v_row.step_role, 'reason', p_reason)::text
  FROM customer_credit_group_requests r WHERE r.id = v_row.request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_credit_group_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_credit_group_change(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
