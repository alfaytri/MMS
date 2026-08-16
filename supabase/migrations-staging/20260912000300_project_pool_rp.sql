-- Projects Option B follow-up — responsible person on the project stock pool.
--
-- The RP that governs custody access (who can consume/return) + shows on the
-- custody card is the POOL sub-container's responsible_person_profile_id.
-- create_project stored the picked RP only on the projects row, never on the
-- pool → the card read "No responsible person assigned" and there was no way
-- to change it. Fix: stamp the pool's RP at creation, and add an RPC to
-- (re)assign it afterwards (updates both the projects row and the pool).
BEGIN;

-- ── create_project — stamp the pool sub-container's RP too ────────────
CREATE OR REPLACE FUNCTION public.create_project(p_project_number text, p_name text, p_division_id uuid, p_warehouse_id uuid, p_discipline_ids uuid[], p_responsible_person_profile_id uuid DEFAULT NULL::uuid)
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
    (project_number, name, division_id, warehouse_id, responsible_person_profile_id, created_by)
  VALUES
    (p_project_number, p_name, p_division_id, p_warehouse_id, p_responsible_person_profile_id, v_uid)
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

-- ── set_project_responsible_person — (re)assign after creation ───────
CREATE OR REPLACE FUNCTION public.set_project_responsible_person(p_project_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._auth_user_has_permission('warehouse.projects.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage projects' USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects
     SET responsible_person_profile_id = p_profile_id, updated_at = now()
   WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  -- Mirror onto the active stock pool (discipline_id IS NULL) so the custody
  -- card + consume/return authorisation see the same RP. NULL clears it.
  UPDATE public.warehouse_sub_containers
     SET responsible_person_profile_id = p_profile_id, updated_at = now()
   WHERE project_id = p_project_id AND discipline_id IS NULL AND is_active;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_project_responsible_person(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_project_responsible_person(uuid, uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
