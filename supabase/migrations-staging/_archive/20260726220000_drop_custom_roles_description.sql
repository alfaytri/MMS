-- ============================================================
-- Drop custom_roles.description + slim add_workflow_step RPC
--
-- Section 1.6 of docs/next-work-plan.md. The description field
-- was optional metadata on custom roles. User's decision: not
-- worth its own UI slot; the role's name plus its permission set
-- already communicates its purpose in-app. Drop the column,
-- update the two UIs that render it, and slim the
-- add_workflow_step RPC signature (drops p_role_desc arg).
--
-- Note: add_workflow_step is only called by useAddWorkflowStep,
-- which has no callers in the codebase — but keeping the RPC in
-- case the seeding scripts / migrations still invoke it.
-- add_workflow_step_for_role is the active variant used by the
-- Approval Chain admin UI.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the column
-- ------------------------------------------------------------
ALTER TABLE public.custom_roles
  DROP COLUMN IF EXISTS description;

-- ------------------------------------------------------------
-- 2. Drop old add_workflow_step overload + recreate slim signature
--    (need to DROP because the arg-list changes)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.add_workflow_step(text, text, text, boolean, text[]);

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
  IF p_workflow NOT IN ('po','inv_check','stock_adj','sales_margin','sales_credit') THEN
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

REVOKE ALL ON FUNCTION public.add_workflow_step(text, text, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_workflow_step(text, text, boolean, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
