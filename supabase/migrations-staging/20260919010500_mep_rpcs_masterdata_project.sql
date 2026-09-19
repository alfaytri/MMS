-- 20260919010500_mep_rpcs_masterdata_project.sql — MEP Phase 2 (Task 6)
-- Master-data RPCs (disciplines, milestone_codes) + project-milestone RPCs,
-- plus create_project extended with customer/site/pin/status/dates.
-- All SECURITY DEFINER, gated on warehouse.projects.manage.
-- rpc_post_consumption is a separate file (Task 7, 20260919010510).
BEGIN;

-- Prerequisite schema fix: project_milestones.label is a vestigial NOT NULL
-- text column from the pre-reshape (sub_container_id, discipline_id, label)
-- design. The 20260919010300 reshape added `name` and backfilled it from
-- `label`, and dropped every UNIQUE constraint that referenced `label`, but
-- left the NOT NULL in place (flagged in that task's review as a deferred
-- minor: "label stays NOT NULL/unused — deprecate in a later task"). This
-- task's rpc_upsert_project_milestone (brief-verbatim body below) inserts by
-- `name`, never `label`, so without this fix every insert fails with a
-- not-null violation (confirmed live on staging). The old add_project_milestone
-- RPC (untouched, still used by the pre-Task-6 MilestoneManager UI) keeps
-- populating `label` explicitly on its own insert path, so this is purely
-- additive — it only relaxes a constraint, never touches existing rows.
ALTER TABLE public.project_milestones ALTER COLUMN label DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.rpc_upsert_discipline(
  p_id uuid, p_division_id uuid, p_name text, p_prefix text DEFAULT NULL, p_sort_order int DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.disciplines (division_id, name, prefix, sort_order, created_by)
    VALUES (p_division_id, btrim(p_name), nullif(btrim(p_prefix),''), coalesce(p_sort_order,0), v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.disciplines SET name=btrim(p_name), prefix=nullif(btrim(p_prefix),''),
           sort_order=coalesce(p_sort_order,0), updated_at=now()
     WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Discipline % not found', p_id; END IF;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_set_discipline_active(p_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  UPDATE public.disciplines SET is_active=p_active, updated_at=now() WHERE id=p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_milestone_code(
  p_id uuid, p_discipline_id uuid, p_code text, p_grp text DEFAULT NULL,
  p_description text DEFAULT NULL, p_sort_order int DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.milestone_codes (discipline_id, code, grp, description, sort_order, created_by)
    VALUES (p_discipline_id, btrim(p_code), nullif(btrim(p_grp),''), nullif(btrim(p_description),''), coalesce(p_sort_order,0), v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.milestone_codes SET code=btrim(p_code), grp=nullif(btrim(p_grp),''),
           description=nullif(btrim(p_description),''), sort_order=coalesce(p_sort_order,0), updated_at=now()
     WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Milestone code % not found', p_id; END IF;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_set_milestone_code_active(p_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  UPDATE public.milestone_codes SET is_active=p_active, updated_at=now() WHERE id=p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_project_milestone(
  p_id uuid, p_project_id uuid, p_discipline_id uuid, p_milestone_no int,
  p_name text, p_description text DEFAULT NULL, p_amount numeric DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_disciplines pd
                 WHERE pd.project_id=p_project_id AND pd.discipline_id=p_discipline_id AND pd.is_active) THEN
    RAISE EXCEPTION 'Discipline % is not part of project %', p_discipline_id, p_project_id; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.project_milestones (project_id, discipline_id, milestone_no, name, description, amount, status, created_by)
    VALUES (p_project_id, p_discipline_id, p_milestone_no, btrim(p_name), nullif(btrim(p_description),''), p_amount, p_status, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.project_milestones SET milestone_no=p_milestone_no, name=btrim(p_name),
           description=nullif(btrim(p_description),''), amount=p_amount, status=p_status, updated_at=now()
     WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Milestone % not found', p_id; END IF;
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.rpc_set_project_milestone_codes(p_milestone_id uuid, p_code_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_disc uuid; v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT discipline_id INTO v_disc FROM public.project_milestones WHERE id=p_milestone_id;
  IF v_disc IS NULL THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;
  -- every code must belong to the milestone's discipline
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_code_ids,'{}'::uuid[])) cid
             LEFT JOIN public.milestone_codes mc ON mc.id=cid
             WHERE mc.id IS NULL OR mc.discipline_id <> v_disc) THEN
    RAISE EXCEPTION 'One or more codes are missing or not in the milestone discipline'; END IF;
  DELETE FROM public.project_milestone_codes WHERE milestone_id=p_milestone_id;
  INSERT INTO public.project_milestone_codes (milestone_id, milestone_code_id, created_by)
  SELECT p_milestone_id, cid, v_uid FROM unnest(coalesce(p_code_ids,'{}'::uuid[])) cid;
END $fn$;

-- grants
REVOKE ALL ON FUNCTION public.rpc_upsert_discipline(uuid,uuid,text,text,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_discipline(uuid,uuid,text,text,int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_set_discipline_active(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_discipline_active(uuid,boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_upsert_milestone_code(uuid,uuid,text,text,text,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_milestone_code(uuid,uuid,text,text,text,int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_set_milestone_code_active(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_milestone_code_active(uuid,boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_upsert_project_milestone(uuid,uuid,uuid,int,text,text,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_project_milestone(uuid,uuid,uuid,int,text,text,numeric,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_set_project_milestone_codes(uuid,uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_project_milestone_codes(uuid,uuid[]) TO authenticated, service_role;

-- ── Extend create_project: +customer/site/pin/status/dates ──────────────
-- The first 6 parameters and the entire body below (permission gate,
-- warehouse-kind guard, discipline guard, the ONE stock pool sub-container
-- INSERT, and the project_disciplines INSERT) are byte-faithful from the live
-- staging pg_get_functiondef — only the new params (appended after the
-- existing ones) and the projects INSERT column list/VALUES changed.
-- CREATE OR REPLACE cannot change the parameter list, so the old 6-arg
-- overload is dropped first to avoid leaving two overloads behind.
DROP FUNCTION IF EXISTS public.create_project(text, text, uuid, uuid, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.create_project(p_project_number text, p_name text, p_division_id uuid, p_warehouse_id uuid, p_discipline_ids uuid[], p_responsible_person_profile_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL, p_site_address text DEFAULT NULL, p_pin text DEFAULT NULL, p_status text DEFAULT 'active', p_start_date date DEFAULT NULL, p_expected_completion_date date DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_kind       text;
  v_uid        uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  SELECT warehouse_kind INTO v_kind FROM public.warehouses WHERE id = p_warehouse_id;
  IF v_kind IS DISTINCT FROM 'custody' THEN
    RAISE EXCEPTION 'Projects live in a custody warehouse (got %)', COALESCE(v_kind, '<none>');
  END IF;
  IF p_discipline_ids IS NULL OR cardinality(p_discipline_ids) = 0 THEN
    RAISE EXCEPTION 'Pick at least one discipline';
  END IF;

  INSERT INTO public.projects
    (project_number, name, division_id, warehouse_id, responsible_person_profile_id, created_by,
     customer_id, site_address, pin, status, start_date, expected_completion_date)
  VALUES
    (p_project_number, p_name, p_division_id, p_warehouse_id, p_responsible_person_profile_id, v_uid,
     p_customer_id, p_site_address, p_pin, p_status, p_start_date, p_expected_completion_date)
  RETURNING id INTO v_project_id;

  -- ONE stock pool sub-container (holds all project stock; no discipline). The
  -- RP is stamped here so custody consume/return authorises correctly.
  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by, project_id, discipline_id, responsible_person_profile_id)
  VALUES
    (p_warehouse_id, p_division_id, p_project_number, true, v_uid, v_project_id, NULL, p_responsible_person_profile_id);

  -- Record the project's disciplines (tags, not containers).
  INSERT INTO public.project_disciplines (project_id, discipline_id, created_by)
  SELECT v_project_id, d.id, v_uid
    FROM public.disciplines d
   WHERE d.id = ANY(p_discipline_ids) AND d.is_active
  ON CONFLICT (project_id, discipline_id) DO NOTHING;

  RETURN v_project_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid, uuid, text, text, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid, uuid, text, text, text, date, date) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
