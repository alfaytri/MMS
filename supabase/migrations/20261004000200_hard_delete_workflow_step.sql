-- Convert workflow-step "archive" -> hard delete.
--
-- approval_workflow_steps has NO inbound foreign keys, so removing a row is clean
-- (past approvals snapshot role NAMES, not step ids). Adds delete_workflow_step,
-- mirroring archive_workflow_step's permission gate (purchase.approvals.chain.manage
-- + Owner approval-slot) but DELETEing the row instead of setting archived_at.
-- archive_workflow_step is left in place (harmless) in case anything still calls it.

CREATE OR REPLACE FUNCTION public.delete_workflow_step(p_step_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_owner boolean;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.approvals.chain.manage') THEN
    RAISE EXCEPTION 'Not authorized to edit approval workflows' USING ERRCODE = '42501';
  END IF;

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
    RAISE EXCEPTION 'Only owners can delete approval chain steps';
  END IF;

  DELETE FROM approval_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_workflow_step(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_workflow_step(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_workflow_step(uuid, uuid) TO authenticated;
