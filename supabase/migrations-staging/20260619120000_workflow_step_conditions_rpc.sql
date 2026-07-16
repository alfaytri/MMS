-- ============================================================================
-- update_workflow_step_conditions  -  UPDATE conditional flag + types
-- ============================================================================
-- Lets admins flip an existing approval step between "always trigger" and
-- "trigger only when the workflow's runtime value is in this list".
--
-- Used by the ApprovalChainConfig UI in master-data/users.

CREATE OR REPLACE FUNCTION public.update_workflow_step_conditions(
  p_step_id         UUID,
  p_is_conditional  BOOLEAN,
  p_condition_types TEXT[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE workflow_approval_steps
  SET is_conditional  = p_is_conditional,
      condition_types = CASE
        WHEN p_is_conditional THEN COALESCE(p_condition_types, ARRAY[]::TEXT[])
        ELSE ARRAY[]::TEXT[]
      END
  WHERE id = p_step_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found or already archived';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_workflow_step_conditions TO authenticated;

NOTIFY pgrst, 'reload schema';
