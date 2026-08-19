-- Team "held" count = tools the team currently HOLDS = assigned units only.
--
-- Previously held_count counted any non-retired unit in a team's custody, which
-- included a stale 'maintenance' unit whose custody was never cleared — making
-- the Teams / Monthly Check team cards disagree with the assigned list (History)
-- and with the Phase 2 model ("a tool in repair leaves the team"). Rebased on the
-- live body (pg_get_functiondef); the ONLY change is the count filter:
--     u.status <> 'retired'   ->   u.status = 'assigned'
-- Return shape + signature unchanged, so CREATE OR REPLACE is safe (single overload).
CREATE OR REPLACE FUNCTION public.get_teams_with_tool_counts(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(team_id uuid, team_name text, division_id uuid, division_name text, responsible_person_name text, held_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT sc.id, sc.name, sc.division_id, cd.name,
         ud.full_name,
         (SELECT count(*)::int FROM public.tool_asset_units u
            WHERE u.current_custody_location_id = sc.id AND u.status = 'assigned')
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w ON w.id = sc.warehouse_id AND w.warehouse_kind = 'custody'
  LEFT JOIN public.company_divisions cd ON cd.id = sc.division_id
  LEFT JOIN public.user_data ud ON ud.id = sc.responsible_person_profile_id
  WHERE sc.is_active IS DISTINCT FROM false
    AND (p_division_ids IS NULL OR sc.division_id = ANY(p_division_ids))
  ORDER BY cd.name, sc.name;
$function$;

NOTIFY pgrst, 'reload schema';
