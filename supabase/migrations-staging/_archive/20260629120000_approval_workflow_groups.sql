-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-path approval groups.
--
-- Each workflow's approval chain can have multiple "paths" (groups).
-- Each path has its own mode:
--   • any_one  — first approved step in the group completes it
--   • all_must — every step in the group must be approved
--
-- Paths relate to each other with OR logic: if ANY path completes,
-- the entire workflow request is approved.
--
-- Example:
--   Path A (all_must): [PM, Accountant]  — both must sign off
--   Path B (any_one):  [GM, Director]    — either alone is enough
--   → If Path A OR Path B is satisfied → approved.
--
-- Backfill: creates one "Default" group per workflow (mode: any_one)
-- and assigns all existing steps to it — zero behavior change.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. approval_workflow_groups table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.approval_workflow_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow    text NOT NULL
              CHECK (workflow = ANY(ARRAY[
                'po','inv_check','stock_adj','sales_margin','sales_credit',
                'credit_group','receival_edit'
              ])),
  group_label text NOT NULL DEFAULT 'Default',
  group_order integer NOT NULL DEFAULT 1,
  mode        text NOT NULL DEFAULT 'any_one'
              CHECK (mode IN ('any_one', 'all_must')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_workflow_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read workflow groups"
  ON public.approval_workflow_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert workflow groups"
  ON public.approval_workflow_groups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update workflow groups"
  ON public.approval_workflow_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete workflow groups"
  ON public.approval_workflow_groups FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflow_groups TO authenticated, service_role;

-- ── 2. Add group_id FK to approval_workflow_steps ────────────────────────────

ALTER TABLE public.approval_workflow_steps
  ADD COLUMN IF NOT EXISTS group_id uuid
    REFERENCES public.approval_workflow_groups(id) ON DELETE SET NULL;

-- ── 3. Backfill: one default group per workflow ──────────────────────────────

DO $$
DECLARE
  v_workflow text;
  v_group_id uuid;
BEGIN
  FOR v_workflow IN
    SELECT DISTINCT workflow
    FROM   public.approval_workflow_steps
    WHERE  archived_at IS NULL
  LOOP
    INSERT INTO public.approval_workflow_groups
      (workflow, group_label, group_order, mode)
    VALUES
      (v_workflow, 'Default', 1, 'any_one')
    RETURNING id INTO v_group_id;

    UPDATE public.approval_workflow_steps
    SET    group_id = v_group_id
    WHERE  workflow    = v_workflow
      AND  archived_at IS NULL;
  END LOOP;
END $$;

-- ── 4. Update add_workflow_step_for_role — accept p_group_id ─────────────────

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
    'credit_group','receival_edit'
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

  -- Auto-detect group when not provided
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

-- ── 5. Update legacy add_workflow_step — accept p_group_id ───────────────────

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
    INSERT INTO custom_roles (name, description, is_approval_slot, is_system, permissions)
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
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
