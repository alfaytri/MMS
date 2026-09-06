-- Service Order Approval: seed the workflow group so it appears on
-- /master-data/admin/approval-workflows (admins assign the approver roles/steps
-- there), and a build_order_approval_chain() that mirrors build_sales_approval_chain
-- but for orders — reads the 'service_order' workflow steps and opens pending
-- sale_order_approvals rows with source_type='order'. If no steps are configured
-- yet, it opens one generic pending step any 'orders.approve' holder can action,
-- so a high-risk order is never left unapprovable.
BEGIN;

-- The workflow column is whitelisted by a CHECK on both tables — add 'service_order'.
ALTER TABLE public.approval_workflow_groups DROP CONSTRAINT IF EXISTS approval_workflow_groups_workflow_check;
ALTER TABLE public.approval_workflow_groups ADD CONSTRAINT approval_workflow_groups_workflow_check
  CHECK (workflow = ANY (ARRAY['po','inv_check','stock_adj','sales_margin','sales_credit','credit_group','receival_edit','consumption_edit','service_order']));

ALTER TABLE public.approval_workflow_steps DROP CONSTRAINT IF EXISTS workflow_approval_steps_workflow_check;
ALTER TABLE public.approval_workflow_steps ADD CONSTRAINT workflow_approval_steps_workflow_check
  CHECK (workflow = ANY (ARRAY['po','inv_check','stock_adj','sales_margin','sales_credit','credit_group','receival_edit','consumption_edit','service_order']));

-- Seed the group (idempotent).
INSERT INTO public.approval_workflow_groups (workflow, group_label, group_order, mode, is_active)
SELECT 'service_order', 'Service Order Approval',
       COALESCE((SELECT MAX(group_order) FROM public.approval_workflow_groups), 0) + 1,
       'all_must', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.approval_workflow_groups WHERE workflow = 'service_order'
);

CREATE OR REPLACE FUNCTION public.build_order_approval_chain(p_order_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iteration int;
  v_step      RECORD;
  v_any       boolean := false;
BEGIN
  SELECT COALESCE(MAX(iteration), 0) + 1 INTO v_iteration
  FROM   sale_order_approvals
  WHERE  source_id     = p_order_id
    AND  approval_type = 'service_order';

  FOR v_step IN
    SELECT was.step_order, cr.name AS role_name
    FROM   approval_workflow_steps was
    JOIN   custom_roles cr ON cr.id = was.role_id
    WHERE  was.workflow    = 'service_order'
      AND  was.is_active   = true
      AND  was.archived_at IS NULL
    ORDER  BY was.step_order
  LOOP
    v_any := true;
    INSERT INTO sale_order_approvals (
      source_type, source_id, approval_type, status,
      requested_by, reason, step_role, step_order, is_active, iteration
    ) VALUES (
      'order', p_order_id, 'service_order', 'pending',
      (p_payload->>'requested_by')::uuid, p_payload::text,
      v_step.role_name, v_step.step_order, true, v_iteration
    );
  END LOOP;

  IF NOT v_any THEN
    INSERT INTO sale_order_approvals (
      source_type, source_id, approval_type, status,
      requested_by, reason, step_role, step_order, is_active, iteration
    ) VALUES (
      'order', p_order_id, 'service_order', 'pending',
      (p_payload->>'requested_by')::uuid, p_payload::text,
      NULL, 1, true, v_iteration
    );
  END IF;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
