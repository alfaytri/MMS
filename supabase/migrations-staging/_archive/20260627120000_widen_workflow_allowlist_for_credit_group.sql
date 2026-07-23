-- Widen the hardcoded workflow allow-list in add_workflow_step /
-- add_workflow_step_for_role to include 'credit_group'.
--
-- The CHECK constraint on approval_workflow_steps.workflow was widened by
-- 20260627119000_credit_group_approval_workflow.sql, but the two RPCs that
-- create new steps carry their own NOT IN guard list and still rejected
-- 'credit_group' with "Invalid workflow: credit_group" when an admin tried
-- to edit the chain from the Approval Workflows page.
BEGIN;

-- ─── add_workflow_step (legacy variant — takes role NAME) ───────────────────
CREATE OR REPLACE FUNCTION public.add_workflow_step(
  p_workflow         text,
  p_role_name        text,
  p_role_desc        text DEFAULT ''::text,
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
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit','credit_group') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  SELECT id INTO v_role_id
  FROM custom_roles
  WHERE name = p_role_name AND deleted_at IS NULL;

  IF v_role_id IS NULL THEN
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
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

-- ─── add_workflow_step_for_role (current variant — takes role UUID) ─────────
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
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit','credit_group') THEN
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
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM approval_workflow_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO approval_workflow_steps (
    workflow, role_id, step_key, step_label, step_order,
    is_conditional, condition_types
  ) VALUES (
    p_workflow, p_role_id, v_step_key, v_role_name, v_max_order + 1,
    p_is_conditional, p_condition_types
  )
  RETURNING * INTO v_step;

  RETURN to_jsonb(v_step);
END;
$$;

COMMIT;
