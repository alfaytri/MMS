BEGIN;

-- Insert a new workflow step bound to an existing approval-slot role.
-- Distinct from add_workflow_step (which creates a new role + step).
CREATE OR REPLACE FUNCTION add_workflow_step_for_role(
  p_workflow        TEXT,
  p_role_id         UUID,
  p_is_conditional  BOOLEAN DEFAULT false,
  p_condition_types TEXT[]  DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_name TEXT;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      workflow_approval_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj') THEN
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

  -- Prevent duplicate role in same workflow (active or inactive, not archived)
  IF EXISTS (
    SELECT 1 FROM workflow_approval_steps
    WHERE workflow = p_workflow
      AND role_id  = p_role_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This role is already a step in the % workflow', p_workflow;
  END IF;

  v_step_key := LOWER(REGEXP_REPLACE(TRIM(v_role_name), '\s+', '_', 'g'));

  -- Ensure step_key uniqueness within the workflow
  IF EXISTS (
    SELECT 1 FROM workflow_approval_steps
    WHERE workflow = p_workflow AND step_key = v_step_key
  ) THEN
    v_step_key := v_step_key || '_' || substr(gen_random_uuid()::text, 1, 6);
  END IF;

  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM workflow_approval_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO workflow_approval_steps (
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

GRANT EXECUTE ON FUNCTION add_workflow_step_for_role(TEXT, UUID, BOOLEAN, TEXT[]) TO authenticated;

COMMIT;
