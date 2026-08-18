-- Tools & Assets Phase 2 rework — return destination.
--
-- A returned tool records WHICH store it went back to, so "where did it go" is
-- answerable. Return destinations are the physical (non-virtual) store warehouses
-- (Birkat, Industrial Area, …) — custody warehouses hold teams, not idle tools,
-- and the stores are warehouse-level (not sub-containers) in this data. The unit
-- stays available with a NULL custody pointer (as before); the destination is
-- stamped on the closed ledger row and surfaced through the unit timeline.

BEGIN;

ALTER TABLE public.tool_unit_assignments
  ADD COLUMN IF NOT EXISTS returned_to_warehouse_id uuid REFERENCES public.warehouses(id);

-- rpc_return_tool_unit gains p_to_warehouse_id. Adding a parameter changes the
-- arity => it is a NEW overload, not a replace, so DROP the old 2-arg signature
-- first (a 2-arg call then resolves to the 3-arg-with-default). Rebased on the
-- live body (tools.assets.manage gate).
DROP FUNCTION IF EXISTS public.rpc_return_tool_unit(uuid, text);
CREATE FUNCTION public.rpc_return_tool_unit(p_unit_id uuid, p_notes text DEFAULT NULL::text, p_to_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to return tools' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'returned',
        notes = COALESCE(p_notes, notes),
        returned_to_warehouse_id = p_to_warehouse_id
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = NULL, status = 'available'
    WHERE id = p_unit_id;
END $function$;

-- Return destinations = physical (non-virtual) store warehouses, human-readable.
CREATE OR REPLACE FUNCTION public.get_return_destinations()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT w.id, w.name
  FROM public.warehouses w
  WHERE w.is_virtual = false
  ORDER BY w.name;
$function$;

-- Timeline surfaces the returned-to store name on release rows (append column =>
-- DROP+CREATE, rebased on the live body).
DROP FUNCTION IF EXISTS public.get_tool_unit_timeline(uuid);
CREATE FUNCTION public.get_tool_unit_timeline(p_unit_id uuid)
RETURNS TABLE(assignment_id uuid, team_id uuid, team_name text, assigned_at timestamptz,
              released_at timestamptz, days numeric, is_current boolean, returned_to_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT a.id, a.custody_location_id, sc.name,
         a.assigned_at, a.released_at,
         round((EXTRACT(EPOCH FROM (COALESCE(a.released_at, now()) - a.assigned_at)) / 86400.0)::numeric, 1),
         (a.released_at IS NULL),
         w.name
  FROM public.tool_unit_assignments a
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
  LEFT JOIN public.warehouses w ON w.id = a.returned_to_warehouse_id
  WHERE a.unit_id = p_unit_id
  ORDER BY a.assigned_at;
$function$;

REVOKE ALL ON FUNCTION public.rpc_return_tool_unit(uuid, text, uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_return_destinations() FROM public;
REVOKE ALL ON FUNCTION public.get_tool_unit_timeline(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_unit(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_return_destinations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tool_unit_timeline(uuid) TO authenticated, service_role;

COMMIT;
