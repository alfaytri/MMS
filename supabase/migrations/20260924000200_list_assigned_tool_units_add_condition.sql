-- Add `condition` (Good/Fair health axis) to list_assigned_tool_units so the
-- Custody page team cards can show a condition badge per assigned tool WITHOUT a
-- second per-team query (the card reuses this one bulk read, grouped per team).
--
-- Return-type change → DROP + CREATE (CREATE OR REPLACE cannot alter a
-- function's RETURNS TABLE signature). Grants re-applied. Nothing in the DB
-- depends on this leaf read RPC (client-only), so the DROP is safe.
--
-- Verified against staging first: single overload list_assigned_tool_units(uuid[]),
-- live body byte-identical to 20260924000000; tool_asset_units.condition exists
-- (enum, cast ::text exactly as the sibling read RPCs do).
BEGIN;

DROP FUNCTION IF EXISTS public.list_assigned_tool_units(uuid[]);

CREATE FUNCTION public.list_assigned_tool_units(p_division_ids uuid[] DEFAULT NULL)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text,
              current_team_id uuid, current_team_name text, status text, condition text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name,
         u.status::text, u.condition::text
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
