-- Widen the 5-arg / 6-arg workflow-step helpers for consumption_edit.
--
-- Bug: migration 20260815001600 widened the 4-arg
-- add_workflow_step_for_role(text, uuid, boolean, text[]) allowlist to
-- include 'consumption_edit', but it left the 5-arg overload
-- add_workflow_step_for_role(text, uuid, boolean, text[], uuid)
-- (introduced in 20260629120000 with p_group_id) untouched. The
-- ApprovalChainManagement UI always sends p_group_id, so it hits the
-- stale overload and P0001 "Invalid workflow: consumption_edit" fires.
--
-- Same regression on the 6-arg legacy add_workflow_step.
--
-- Fix: CREATE OR REPLACE both overloads with the widened allowlist
-- matching approval_workflow_steps.workflow_check (widened in
-- 20260815001600) and approval_workflow_groups.workflow_check (widened
-- in 20260815001700).

BEGIN;

-- ── 5-arg add_workflow_step_for_role (widen allowlist) ────────────────────

CREATE OR REPLACE FUNCTION public.add_workflow_step_for_role(
  p_workflow         text,
  p_role_id          uuid,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[],
  p_group_id         uuid   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit','consumption_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  SELECT name INTO v_role_name
  FROM   custom_roles
  WHERE  id = p_role_id
    AND  is_approval_slot = true
    AND  deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow
      AND  role_id  = p_role_id
      AND  archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow AND step_key = v_step_key
      AND  archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

-- ── 6-arg legacy add_workflow_step (widen allowlist) ──────────────────────

CREATE OR REPLACE FUNCTION public.add_workflow_step(
  p_workflow         text,
  p_role_name        text,
  p_role_desc        text DEFAULT ''::text,
  p_is_conditional   boolean DEFAULT false,
  p_condition_types  text[] DEFAULT '{}'::text[],
  p_group_id         uuid   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit','consumption_edit'
  ) THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;

  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM   custom_roles
  WHERE  name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), true, false, '{}'::text[])
    RETURNING id INTO v_role_id;
  ELSE
    UPDATE custom_roles SET is_approval_slot = true WHERE id = v_role_id;
  END IF;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM   approval_workflow_groups
    WHERE  workflow = p_workflow AND is_active = true
    ORDER BY group_order
    LIMIT  1;

    IF v_group_id IS NULL THEN
      INSERT INTO approval_workflow_groups (workflow, group_label, group_order, mode)
      VALUES (p_workflow, 'Default', 1, 'any_one')
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  IF EXISTS (
    SELECT 1 FROM approval_workflow_steps
    WHERE  workflow = p_workflow AND step_key = v_step_key
      AND  archived_at IS NULL
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 4);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM   approval_workflow_steps
  WHERE  workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types, group_id
  ) VALUES (
    p_workflow, v_role_id, v_step_key, TRIM(p_role_name), v_max_order + 1,
    p_is_conditional, p_condition_types, v_group_id
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

COMMIT;
