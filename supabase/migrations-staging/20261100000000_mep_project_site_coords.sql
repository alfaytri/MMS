-- MEP projects: the site address becomes Blue-Plate-or-Coordinates, matching
-- the customer master's AddressFinder. The free-text `pin` column is replaced
-- by GPS coordinates; `site_address` keeps the human string (a Qatar blue-plate
-- string "Zone.., Street.., Building.." or a place name).
--
-- create_project must be rebuilt because its arg list changes
-- (p_pin  ->  p_site_latitude / p_site_longitude), so DROP + CREATE + re-grant.
-- Ordered add-columns -> replace-function -> drop-pin so no intermediate state
-- references a missing column (the whole file applies in one transaction).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS site_latitude  numeric,
  ADD COLUMN IF NOT EXISTS site_longitude numeric;

DROP FUNCTION IF EXISTS public.create_project(text, text, uuid, uuid, uuid[], uuid, uuid, text, text, text, date, date);

CREATE OR REPLACE FUNCTION public.create_project(
  p_project_number                text,
  p_name                          text,
  p_division_id                   uuid,
  p_warehouse_id                  uuid,
  p_discipline_ids                uuid[],
  p_responsible_person_profile_id uuid    DEFAULT NULL::uuid,
  p_customer_id                   uuid    DEFAULT NULL::uuid,
  p_site_address                  text    DEFAULT NULL::text,
  p_site_latitude                 numeric DEFAULT NULL::numeric,
  p_site_longitude                numeric DEFAULT NULL::numeric,
  p_status                        text    DEFAULT 'active'::text,
  p_start_date                    date    DEFAULT NULL::date,
  p_expected_completion_date      date    DEFAULT NULL::date
) RETURNS uuid
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
     customer_id, site_address, site_latitude, site_longitude, status, start_date, expected_completion_date)
  VALUES
    (p_project_number, p_name, p_division_id, p_warehouse_id, p_responsible_person_profile_id, v_uid,
     p_customer_id, p_site_address, p_site_latitude, p_site_longitude, p_status, p_start_date, p_expected_completion_date)
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

REVOKE ALL     ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid, uuid, text, numeric, numeric, text, date, date) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_project(text, text, uuid, uuid, uuid[], uuid, uuid, text, numeric, numeric, text, date, date) TO   authenticated, service_role;

ALTER TABLE public.projects DROP COLUMN IF EXISTS pin;
