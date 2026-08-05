-- Teams + Places + Consumption — Task 9 revision: Request Cancellation flow
--
-- Operator feedback: "no need for cancel consumption for everyone — can
-- request edit, but we need to create a flow for that in the approval
-- workflows tab where I can assign the user who will accept that."
--
-- The Cancel button on ConsumptionDetailDialog is being replaced with a
-- "Request Cancellation" flow that mirrors the existing PO edit-request
-- pattern (`po_edit_requests`, migration 20260625130000):
--
--   1. Any signed-in user opens a pending request with a reason.
--   2. The Approval Workflows admin (Master Data → Admin → Approval
--      Workflows) assigns which role(s) act as approvers on the new
--      `consumption_edit` workflow.
--   3. A holder of that role approves → rpc_cancel_consumption fires
--      atomically. Or rejects with a comment; nothing else changes.
--
-- Register `consumption_edit` in the approval_workflow_steps CHECK +
-- both add_workflow_step / add_workflow_step_for_role SECURITY DEFINER
-- helpers so the existing ApprovalChainManagement UI can configure it.
--
-- Prior migration: 20260815001500_consumption_consumer_type_rename.sql.

BEGIN;

-- ── 1. consumption_edit_requests table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consumption_edit_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_id  uuid NOT NULL REFERENCES public.consumption_entries(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES public.user_data(id),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid REFERENCES public.user_data(id),
  reviewed_at     timestamptz,
  review_comment  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ce_edit_requests_consumption_idx
  ON public.consumption_edit_requests(consumption_id);
CREATE INDEX IF NOT EXISTS ce_edit_requests_pending_idx
  ON public.consumption_edit_requests(consumption_id) WHERE status = 'pending';

-- At most one open request per consumption at a time (prevents duplicate
-- pending noise on the same CE).
CREATE UNIQUE INDEX IF NOT EXISTS ce_edit_requests_one_pending_per_consumption
  ON public.consumption_edit_requests(consumption_id) WHERE status = 'pending';

ALTER TABLE public.consumption_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ce_edit_requests_select
  ON public.consumption_edit_requests FOR SELECT TO authenticated USING (true);

-- Insert: the caller must be the requester and they must resolve to a
-- user_data row (belt-and-braces against a service-role client).
CREATE POLICY ce_edit_requests_insert
  ON public.consumption_edit_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT id FROM public.user_data WHERE auth_user_id = (SELECT auth.uid()))
  );

-- Update: only users holding a role that's configured as an active step
-- on the `consumption_edit` workflow can approve/reject. Same shape as
-- the PO edit-request update policy but scoped by workflow.
CREATE POLICY ce_edit_requests_update
  ON public.consumption_edit_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_custom_roles ucr
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      JOIN public.user_data ud   ON ud.id = ucr.profile_id
      JOIN public.approval_workflow_steps aws ON aws.role_id = cr.id
      WHERE ud.auth_user_id = (SELECT auth.uid())
        AND cr.deleted_at IS NULL
        AND aws.workflow = 'consumption_edit'
        AND aws.archived_at IS NULL
    )
  );

COMMENT ON TABLE public.consumption_edit_requests IS
'Operator-filed request to cancel a posted consumption. Any authenticated
user opens a pending row; only role-holders configured on the
consumption_edit approval workflow can update. Approval fires
rpc_cancel_consumption atomically.';

-- ── 2. Widen approval_workflow_steps CHECK ───────────────────────────────

ALTER TABLE public.approval_workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_approval_steps_workflow_check;
ALTER TABLE public.approval_workflow_steps
  ADD CONSTRAINT workflow_approval_steps_workflow_check
  CHECK (workflow = ANY (ARRAY[
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit','consumption_edit'
  ]));

-- ── 3. Refresh add_workflow_step (legacy — regressed on 26-07-26) ────────

CREATE OR REPLACE FUNCTION public.add_workflow_step(
  p_workflow         text,
  p_role_name        text,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), true, false, '{}'::text[])
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

-- ── 4. Widen add_workflow_step_for_role (active variant) ─────────────────

CREATE OR REPLACE FUNCTION public.add_workflow_step_for_role(
  p_workflow         text,
  p_role_id          uuid,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit',
                        'credit_group','receival_edit','consumption_edit') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
      AND archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, p_role_id, v_step_key, TRIM(v_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

-- ── 5. rpc_request_consumption_edit ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_request_consumption_edit(
  p_consumption_id uuid,
  p_reason         text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid       uuid := public._current_user_data_id();
  v_status    text;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: not authenticated';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: reason is required';
  END IF;

  SELECT status INTO v_status
    FROM public.consumption_entries
    WHERE id = p_consumption_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % not found', p_consumption_id;
  END IF;
  IF v_status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: consumption % is % (only posted entries can be requested)', p_consumption_id, v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.consumption_edit_requests
    WHERE consumption_id = p_consumption_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'rpc_request_consumption_edit: a pending request already exists for this consumption';
  END IF;

  INSERT INTO public.consumption_edit_requests (
    consumption_id, requested_by, reason
  ) VALUES (
    p_consumption_id, v_uid, btrim(p_reason)
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_request_consumption_edit(uuid, text) IS
'Opens a pending consumption_edit_requests row asking to cancel the
consumption. Only posted consumptions accept requests; at most one
pending row per consumption.';

-- ── 6. rpc_decide_consumption_edit ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_decide_consumption_edit(
  p_request_id uuid,
  p_decision   text,
  p_comment    text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid            uuid := public._current_user_data_id();
  v_request        RECORD;
  v_is_approver    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: not authenticated';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: decision must be approved|rejected (got %)', p_decision;
  END IF;

  SELECT id, consumption_id, status
    INTO v_request
    FROM public.consumption_edit_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % not found', p_request_id;
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: request % is % (expected pending)', p_request_id, v_request.status;
  END IF;

  -- Caller must hold a role configured on the consumption_edit workflow.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_custom_roles ucr
    JOIN public.custom_roles cr ON cr.id = ucr.role_id
    JOIN public.approval_workflow_steps aws ON aws.role_id = cr.id
    WHERE ucr.profile_id = v_uid
      AND cr.deleted_at IS NULL
      AND aws.workflow = 'consumption_edit'
      AND aws.archived_at IS NULL
  ) INTO v_is_approver;

  IF NOT v_is_approver THEN
    RAISE EXCEPTION 'rpc_decide_consumption_edit: caller is not configured as a consumption_edit approver';
  END IF;

  UPDATE public.consumption_edit_requests
     SET status         = p_decision,
         reviewed_by    = v_uid,
         reviewed_at    = now(),
         review_comment = NULLIF(btrim(coalesce(p_comment, '')), '')
   WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    -- Fires the same cancellation flow as the old operator-driven Cancel
    -- button. rpc_cancel_consumption raises if the entry is not posted;
    -- since our own rpc_request_consumption_edit guards on that at request
    -- time, this only trips on a race we'd want to surface anyway.
    PERFORM public.rpc_cancel_consumption(v_request.consumption_id);
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.rpc_decide_consumption_edit(uuid, text, text) IS
'Approves or rejects a consumption edit request. Caller must hold a role
configured on the consumption_edit approval workflow. On approve, fires
rpc_cancel_consumption to reverse the consumption atomically.';

NOTIFY pgrst, 'reload schema';

COMMIT;
