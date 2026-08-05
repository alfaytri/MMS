-- Fix latent bug: `_user_has_permission` and both `add_workflow_step`
-- overloads still reference `custom_roles.is_system`, but that column
-- was renamed to `is_system_admin` on 2026-07-24 (migration
-- 20260724160000_rename_is_system_to_is_system_admin.sql). Nothing
-- had exercised these code paths since the rename because the
-- old RLS policies used `USING (true)` and never invoked
-- `_user_has_permission()`. The next migration
-- (20260806000000_lock_money_table_rls.sql) starts calling it, so
-- the fix must land immediately.
--
-- Bodies pulled from live pg_proc via pg_get_functiondef, then only
-- the `is_system` → `is_system_admin` rename applied — nothing else
-- changed. Preserves the `SET search_path` config attached by
-- 20260805220000_lock_function_search_path.sql.

CREATE OR REPLACE FUNCTION public._user_has_permission(p_profile_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN custom_roles cr ON cr.id = ucr.role_id AND cr.deleted_at IS NULL
    WHERE ucr.profile_id = p_profile_id
      AND (cr.is_system_admin = true OR p_permission = ANY(cr.permissions))
  );
$function$
;


CREATE OR REPLACE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    INSERT INTO custom_roles (name, is_approval_slot, is_system_admin, permissions)
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
$function$
;


CREATE OR REPLACE FUNCTION public.add_workflow_step(p_workflow text, p_role_name text, p_role_desc text DEFAULT ''::text, p_is_conditional boolean DEFAULT false, p_condition_types text[] DEFAULT '{}'::text[], p_group_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id   UUID;
  v_max_order INT;
  v_step_key  TEXT;
  v_step      approval_workflow_steps;
  v_group_id  uuid := p_group_id;
BEGIN
  IF p_workflow NOT IN (
    'po','inv_check','stock_adj','sales_margin','sales_credit',
    'credit_group','receival_edit'
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
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system_admin, permissions)
    VALUES (TRIM(p_role_name), NULLIF(TRIM(p_role_desc),''), true, false, '[]'::jsonb)
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
$function$
;


