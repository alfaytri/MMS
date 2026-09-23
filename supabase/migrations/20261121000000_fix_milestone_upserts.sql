-- Fix: milestone-code and project-milestone CREATE raised "P0001 ... not found".
-- The frontend generates a fresh uuid (crypto.randomUUID()) as p_id on CREATE
-- and passes the existing id on EDIT, but the RPCs branched on `p_id IS NULL`
-- and routed any non-null id to the UPDATE branch → a fresh-id create matched 0
-- rows → RAISE 'not found'. Rewrite both as true upserts honoring the client id
-- (INSERT ... ON CONFLICT (id) DO UPDATE), preserving the auth + ownership guards.

CREATE OR REPLACE FUNCTION public.rpc_upsert_milestone_code(
  p_id            uuid,
  p_discipline_id uuid,
  p_code          text,
  p_grp           text    DEFAULT NULL::text,
  p_description   text    DEFAULT NULL::text,
  p_sort_order    integer DEFAULT 0
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.milestone_codes (id, discipline_id, code, grp, description, sort_order, created_by)
  VALUES (COALESCE(p_id, gen_random_uuid()), p_discipline_id, btrim(p_code),
          nullif(btrim(p_grp),''), nullif(btrim(p_description),''), coalesce(p_sort_order,0), v_uid)
  ON CONFLICT (id) DO UPDATE
    SET code        = btrim(p_code),
        grp         = nullif(btrim(p_grp),''),
        description = nullif(btrim(p_description),''),
        sort_order  = coalesce(p_sort_order,0),
        updated_at  = now()
  RETURNING id INTO v_id;   -- discipline_id is never reassigned on edit

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_project_milestone(
  p_id            uuid,
  p_project_id    uuid,
  p_discipline_id uuid,
  p_milestone_no  integer,
  p_name          text,
  p_description   text    DEFAULT NULL::text,
  p_amount        numeric DEFAULT NULL::numeric,
  p_status        text    DEFAULT NULL::text
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.project_disciplines pd
                 WHERE pd.project_id=p_project_id AND pd.discipline_id=p_discipline_id AND pd.is_active) THEN
    RAISE EXCEPTION 'Discipline % is not part of project %', p_discipline_id, p_project_id;
  END IF;

  -- Upsert on the client id. The DO UPDATE ... WHERE keeps the cross-project
  -- guard: editing an id that belongs to a different project/discipline updates
  -- nothing (v_id stays NULL) and raises, rather than moving the milestone.
  INSERT INTO public.project_milestones
    (id, project_id, discipline_id, milestone_no, name, description, amount, status, created_by)
  VALUES (COALESCE(p_id, gen_random_uuid()), p_project_id, p_discipline_id, p_milestone_no, btrim(p_name),
          nullif(btrim(p_description),''), p_amount, p_status, v_uid)
  ON CONFLICT (id) DO UPDATE
    SET milestone_no = p_milestone_no,
        name         = btrim(p_name),
        description  = nullif(btrim(p_description),''),
        amount       = p_amount,
        status       = p_status,
        updated_at   = now()
    WHERE project_milestones.project_id = p_project_id
      AND project_milestones.discipline_id = p_discipline_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Milestone % belongs to a different project/discipline', p_id;
  END IF;

  RETURN v_id;
END $function$;
