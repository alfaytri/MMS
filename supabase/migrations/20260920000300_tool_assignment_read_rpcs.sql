-- Tools & Assets Phase 1: read RPCs for the hub (teams+counts, a team's units,
-- assignable units, unit timeline, serial/name search). All STABLE SECURITY
-- DEFINER, granted to authenticated + service_role only.

BEGIN;

-- Custody teams (division-scoped) with the count of tools they currently hold.
CREATE OR REPLACE FUNCTION public.get_teams_with_tool_counts(p_division_ids uuid[] DEFAULT NULL)
RETURNS TABLE(team_id uuid, team_name text, division_id uuid, division_name text,
              responsible_person_name text, held_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.id, sc.name, sc.division_id, cd.name,
         ud.full_name,
         (SELECT count(*)::int FROM public.tool_asset_units u
            WHERE u.current_custody_location_id = sc.id AND u.status <> 'retired')
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w ON w.id = sc.warehouse_id AND w.warehouse_kind = 'custody'
  LEFT JOIN public.company_divisions cd ON cd.id = sc.division_id
  LEFT JOIN public.user_data ud ON ud.id = sc.responsible_person_profile_id
  WHERE sc.is_active IS DISTINCT FROM false
    AND (p_division_ids IS NULL OR sc.division_id = ANY(p_division_ids))
  ORDER BY cd.name, sc.name;
$$;

-- The tools a team currently holds.
CREATE OR REPLACE FUNCTION public.get_team_tool_units(p_team_id uuid)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text,
              condition text, status text, assigned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand,
         u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL)
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$$;

-- Units assignable to a team in this division: unassigned + not retired, and
-- either already in this division OR not yet divisioned (ISSUE-9 establish-on-
-- assign). Optional search + bounded, since undivisioned tools can be many.
CREATE OR REPLACE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status <> 'retired'
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY i.name_en, u.serial_number
  LIMIT 200;
$$;

-- A unit's full custody timeline: each stint, its team, and days held.
CREATE OR REPLACE FUNCTION public.get_tool_unit_timeline(p_unit_id uuid)
RETURNS TABLE(assignment_id uuid, team_id uuid, team_name text,
              assigned_at timestamptz, released_at timestamptz, days numeric, is_current boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.custody_location_id, sc.name,
         a.assigned_at, a.released_at,
         round((EXTRACT(EPOCH FROM (COALESCE(a.released_at, now()) - a.assigned_at)) / 86400.0)::numeric, 1),
         (a.released_at IS NULL)
  FROM public.tool_unit_assignments a
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
  WHERE a.unit_id = p_unit_id
  ORDER BY a.assigned_at;
$$;

-- Search units by serial or item name; includes the current holder team.
CREATE OR REPLACE FUNCTION public.search_tool_units(p_query text)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text,
              current_team_id uuid, current_team_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.current_custody_location_id, sc.name, u.status::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE p_query IS NOT NULL AND length(trim(p_query)) > 0
    AND (u.serial_number ILIKE '%'||p_query||'%' OR i.name_en ILIKE '%'||p_query||'%')
  ORDER BY u.serial_number
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_teams_with_tool_counts(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_team_tool_units(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_assignable_tool_units(uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.get_tool_unit_timeline(uuid) FROM public;
REVOKE ALL ON FUNCTION public.search_tool_units(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_teams_with_tool_counts(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_tool_units(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_assignable_tool_units(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tool_unit_timeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tool_units(text) TO authenticated, service_role;

COMMIT;
