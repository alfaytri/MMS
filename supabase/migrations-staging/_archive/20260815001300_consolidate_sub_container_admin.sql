-- Teams + Places + Consumption — Task 8c consolidation follow-up:
-- Merge dedicated Teams / Places / Repair-Vendors admin pages into the single
-- Master Data → Warehouses page. That page's inline sub-container UI needs
-- two things the dedicated pages had that direct-table access can't provide:
--
--   1. Cross-division visibility. Sub-containers on Teams / Places virtual
--      warehouses live in one specific division, but admins on the Warehouses
--      page need to see them regardless of their active_division_id.
--
--   2. Cross-division write. Same rationale — sub_container_scope_insert_r
--      blocks creating a Kitchen team sub while the caller's active_division
--      is Maintenance.
--
-- Ship two SECURITY DEFINER helpers that handle those cases in one place:
--
--   get_warehouse_sub_containers_admin(warehouse_id)
--     → returns every sub of a warehouse (all divisions), joined with the
--       responsible person's name + phone. Powers the Warehouses page inline
--       list. Bypasses sub_container_scope RLS.
--
--   rpc_upsert_warehouse_sub_container(...)
--     → generic upsert for any warehouse kind. Handles the shape rules:
--         - real warehouses: division_id required
--         - virtual warehouses: division_id may be null (repair) or required
--           per kind (teams / places require a division)
--       Bypasses sub_container_scope_insert_r / update_r RLS.
--       Also handles the responsible_person_profile_id column added in
--       migration 20260815000800.
--
-- The kind-specific rpc_upsert_team_or_place stays in place — the /custody
-- master lists still call it via useTeams / usePlaces (nothing to migrate).
--
-- Prior migration: 20260815001200_transfer_items_visibility_and_custody_division.sql

-- ── 1. Admin list of sub-containers ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_warehouse_sub_containers_admin(
  p_warehouse_id uuid
) RETURNS TABLE (
  id                              uuid,
  warehouse_id                    uuid,
  division_id                     uuid,
  division_name                   text,
  name                            text,
  is_active                       boolean,
  team_id                         uuid,
  responsible_person_profile_id   uuid,
  responsible_person_name         text,
  responsible_person_phone        text,
  created_at                      timestamptz,
  updated_at                      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sc.id,
         sc.warehouse_id,
         sc.division_id,
         d.name           AS division_name,
         sc.name,
         sc.is_active,
         sc.team_id,
         sc.responsible_person_profile_id,
         u.full_name      AS responsible_person_name,
         u.phone          AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions d ON d.id = sc.division_id
  LEFT   JOIN public.user_data         u ON u.id = sc.responsible_person_profile_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.is_active DESC, d.name NULLS LAST, sc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_warehouse_sub_containers_admin(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.get_warehouse_sub_containers_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_warehouse_sub_containers_admin(uuid) IS
'Admin list of sub-containers under a warehouse, cross-division. Joins
company_divisions + user_data for one-shot rendering of the Warehouses
page inline sub-container UI. Bypasses sub_container_scope RLS so an
admin whose active_division is Maintenance still sees Kitchen team subs.';

-- ── 2. Generic upsert for sub-containers ────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_upsert_warehouse_sub_container(
  p_warehouse_id                  uuid,
  p_name                          text,
  p_division_id                   uuid    DEFAULT NULL,
  p_id                            uuid    DEFAULT NULL,       -- NULL → create
  p_is_active                     boolean DEFAULT NULL,       -- NULL → leave alone on update
  p_responsible_person_profile_id uuid    DEFAULT NULL        -- NULL on create = "unassigned"; on update = "clear"
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_wh_kind text;
  v_is_virtual boolean;
  v_new_id uuid;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  SELECT warehouse_kind, is_virtual
    INTO v_wh_kind, v_is_virtual
    FROM public.warehouses
    WHERE id = p_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse % not found', p_warehouse_id;
  END IF;

  -- Shape rules per warehouse kind:
  --   general / any real WH → division_id REQUIRED
  --   teams / places        → division_id REQUIRED (each team / place is scoped to one division)
  --   repair                → division_id OPTIONAL (nullable — vendors are cross-division)
  IF v_wh_kind IN ('teams', 'places') THEN
    IF p_division_id IS NULL THEN
      RAISE EXCEPTION 'Division is required for % sub-containers.', v_wh_kind;
    END IF;
  ELSIF NOT COALESCE(v_is_virtual, false) THEN
    IF p_division_id IS NULL THEN
      RAISE EXCEPTION 'Division is required for real-warehouse sub-containers.';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    -- Create
    INSERT INTO public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active,
      responsible_person_profile_id
    )
    VALUES (
      p_warehouse_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true),
      p_responsible_person_profile_id
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  -- Update. Verify the sub actually belongs to the requested warehouse so
  -- callers can't retarget a foreign sub.
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers
    WHERE id = p_id AND warehouse_id = p_warehouse_id
  ) THEN
    RAISE EXCEPTION 'Sub-container % is not under warehouse %.', p_id, p_warehouse_id;
  END IF;

  UPDATE public.warehouse_sub_containers
     SET name                          = btrim(p_name),
         division_id                   = COALESCE(p_division_id, division_id),
         is_active                     = COALESCE(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         updated_at                    = now()
   WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_upsert_warehouse_sub_container(uuid, text, uuid, uuid, boolean, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_warehouse_sub_container(uuid, text, uuid, uuid, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_upsert_warehouse_sub_container(uuid, text, uuid, uuid, boolean, uuid) IS
'Generic SECURITY DEFINER upsert for warehouse_sub_containers. Bypasses
sub_container_scope RLS so admin can create/update rows across divisions
(needed for the consolidated Master Data → Warehouses page). Enforces
shape rules per warehouse kind: division required for real / teams /
places, optional for repair. Handles the responsible_person_profile_id
field added in migration 20260815000800.';
