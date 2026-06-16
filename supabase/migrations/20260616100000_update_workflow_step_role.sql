BEGIN;

-- Re-bind a workflow step to a different approval-slot role.
-- Updates role_id and refreshes step_label to the new role name.
CREATE OR REPLACE FUNCTION update_workflow_step_role(
  p_step_id  UUID,
  p_role_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_name TEXT;
BEGIN
  SELECT name INTO v_role_name
  FROM custom_roles
  WHERE id = p_role_id
    AND is_approval_slot = true
    AND deleted_at IS NULL;

  IF v_role_name IS NULL THEN
    RAISE EXCEPTION 'Role not found or is not an approval-slot role';
  END IF;

  UPDATE workflow_approval_steps
  SET role_id    = p_role_id,
      step_label = v_role_name
  WHERE id = p_step_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_workflow_step_role(UUID, UUID) TO authenticated;

COMMIT;
