-- Virtual Warehouse Projects (Phase 1, Task 1.4) — project lifecycle RPCs.
-- SECURITY DEFINER (bypass RLS) so each enforces warehouse.projects.manage in the
-- body (system-admin roles pass via is_system_admin). create_project spins up one
-- discipline sub-container per picked discipline.

CREATE OR REPLACE FUNCTION public.create_project(
  p_project_number text,
  p_name text,
  p_division_id uuid,
  p_warehouse_id uuid,
  p_discipline_ids uuid[],
  p_responsible_person_profile_id uuid DEFAULT NULL
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_kind       text;
  v_disc       record;
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
    (project_number, name, division_id, warehouse_id, responsible_person_profile_id, created_by)
  VALUES
    (p_project_number, p_name, p_division_id, p_warehouse_id, p_responsible_person_profile_id, v_uid)
  RETURNING id INTO v_project_id;

  FOR v_disc IN
    SELECT id, name FROM public.disciplines WHERE id = ANY(p_discipline_ids) AND is_active
  LOOP
    INSERT INTO public.warehouse_sub_containers
      (warehouse_id, division_id, name, is_active, created_by, project_id, discipline_id)
    VALUES
      (p_warehouse_id, p_division_id, p_project_number || ' · ' || v_disc.name, true, v_uid, v_project_id, v_disc.id);
  END LOOP;

  RETURN v_project_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_project_discipline(p_project_id uuid, p_discipline_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sc uuid; v_pn text; v_div uuid; v_wh uuid; v_dname text;
  v_uid uuid := public._current_user_data_id();
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;
  SELECT project_number, division_id, warehouse_id INTO v_pn, v_div, v_wh
    FROM public.projects WHERE id = p_project_id;
  IF v_pn IS NULL THEN RAISE EXCEPTION 'Project % not found', p_project_id; END IF;
  SELECT name INTO v_dname FROM public.disciplines WHERE id = p_discipline_id AND is_active;
  IF v_dname IS NULL THEN RAISE EXCEPTION 'Discipline % not found or inactive', p_discipline_id; END IF;

  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by, project_id, discipline_id)
  VALUES
    (v_wh, v_div, v_pn || ' · ' || v_dname, true, v_uid, p_project_id, p_discipline_id)
  RETURNING id INTO v_sc;
  RETURN v_sc;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_project(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.warehouse_sub_containers sc
    JOIN public.warehouse_sub_container_totals t ON t.sub_container_id = sc.id
    WHERE sc.project_id = p_project_id AND COALESCE(t.total_qty, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Cannot close a project while its disciplines still hold stock';
  END IF;
  UPDATE public.warehouse_sub_containers SET is_active = false, updated_at = now() WHERE project_id = p_project_id;
  UPDATE public.projects               SET is_active = false, updated_at = now() WHERE id = p_project_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
