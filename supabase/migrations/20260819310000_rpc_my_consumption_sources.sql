-- Scoped consumption sources — the picker's server-truth companion to the
-- rpc_post_consumption guard (20260819300000).
--
-- Returns the (warehouse, sub-container) pairs the CURRENT caller may consume
-- from, using the exact same rule the guard enforces:
--   * a custody sub-container they are the responsible person of, OR
--   * any active sub in a real warehouse they are the responsible person of
--     (is_field_rp_of / warehouse_responsible_persons), OR
--   * everything (minus Repair) for a custody-admin (inventory_manager / system
--     admin).
-- Repair (vendor-shadow) warehouses are never a consumption source. Only active
-- sub-containers are returned. SECURITY DEFINER so it can read across the
-- assignment tables regardless of the caller's division RLS — access here is
-- assignment-based, not division-based (per the operator's rule).

CREATE OR REPLACE FUNCTION public.rpc_my_consumption_sources()
RETURNS TABLE (
  warehouse_id       uuid,
  warehouse_name     text,
  warehouse_kind     text,
  sub_container_id   uuid,
  sub_container_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.name, w.warehouse_kind, sc.id, sc.name
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses w ON w.id = sc.warehouse_id
  WHERE  sc.is_active
    AND  COALESCE(w.warehouse_kind, 'general') <> 'repair'
    AND (
          public._has_custody_admin_role(public._current_user_data_id())
       OR sc.responsible_person_profile_id = public._current_user_data_id()
       OR public.is_field_rp_of(public._current_user_data_id(), w.id)
    )
  ORDER BY w.name, sc.name;
$function$;

COMMENT ON FUNCTION public.rpc_my_consumption_sources() IS
'The (warehouse, sub-container) sources the current user may post a consumption '
'from — assigned real warehouses (is_field_rp_of), assigned custody subs '
'(responsible_person_profile_id), or all non-Repair active subs for a custody '
'admin. Mirrors the rpc_post_consumption access guard so the picker matches what '
'the DB will accept.';

REVOKE ALL ON FUNCTION public.rpc_my_consumption_sources() FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_my_consumption_sources() TO authenticated;

NOTIFY pgrst, 'reload schema';
