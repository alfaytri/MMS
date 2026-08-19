-- List currently-assigned serialized tool units for the Tools & Assets
-- "History & Usage" default view (Phase 2 rework follow-up). Mirrors
-- search_tool_units' return shape + joins so the client reuses the same row
-- type, but filters to status = 'assigned' and (optionally) a set of divisions.
--
-- Read-only. SECURITY DEFINER matches the sibling read RPC (search_tool_units)
-- and the already-open read RLS on tool_asset_units (tau_select USING true), so
-- it exposes nothing a caller could not already read; hardened below by revoking
-- PUBLIC/anon EXECUTE so only authenticated callers can reach it.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_assigned_tool_units(p_division_ids uuid[] DEFAULT NULL)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text,
              current_team_id uuid, current_team_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name, u.status::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE u.status = 'assigned'::public.tool_status
    AND (
      p_division_ids IS NULL
      OR array_length(p_division_ids, 1) IS NULL
      OR u.division_id = ANY (p_division_ids)
    )
  ORDER BY i.name_en NULLS LAST, u.serial_number
  LIMIT 200;
$$;

REVOKE EXECUTE ON FUNCTION public.list_assigned_tool_units(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.list_assigned_tool_units(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
