BEGIN;

-- ── Add a new step ──────────────────────────────────────────────────────────
-- Creates a new custom_role (is_approval_slot = true) AND a workflow step.
-- If a role with the same name already exists, reuses it and marks it as approval_slot.
-- Returns the new step row as JSON.
CREATE OR REPLACE FUNCTION add_workflow_step(
  p_workflow       TEXT,
  p_role_name      TEXT,
  p_role_desc      TEXT DEFAULT '',
  p_is_conditional BOOLEAN DEFAULT false,
  p_condition_types TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id  UUID;
  v_max_order INT;
  v_step_key TEXT;
  v_step     workflow_approval_steps;
BEGIN
  IF p_workflow NOT IN ('po','inv_check','stock_adj') THEN
    RAISE EXCEPTION 'Invalid workflow: %', p_workflow;
  END IF;
  IF TRIM(p_role_name) = '' THEN
    RAISE EXCEPTION 'Role name cannot be empty';
  END IF;

  -- Check if role already exists
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

  -- Derive step_key: lowercase, spaces to underscores
  v_step_key := LOWER(REGEXP_REPLACE(TRIM(p_role_name), '\s+', '_', 'g'));

  -- Next step_order
  SELECT COALESCE(MAX(step_order), 0) INTO v_max_order
  FROM workflow_approval_steps
  WHERE workflow = p_workflow AND archived_at IS NULL;

  INSERT INTO workflow_approval_steps (
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

GRANT EXECUTE ON FUNCTION add_workflow_step TO authenticated;

-- ── Toggle a step on/off ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_workflow_step(
  p_step_id  UUID,
  p_active   BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE workflow_approval_steps
  SET is_active = p_active
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_workflow_step TO authenticated;

-- ── Archive a step (owner-only) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION archive_workflow_step(
  p_step_id    UUID,
  p_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE ucr.profile_id = p_profile_id
      AND cr.name = 'Owner'
      AND cr.is_approval_slot = true
      AND cr.deleted_at IS NULL
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Only owners can archive approval chain steps';
  END IF;

  UPDATE workflow_approval_steps
  SET archived_at = now(), archived_by = p_profile_id
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_workflow_step TO authenticated;

COMMIT;
