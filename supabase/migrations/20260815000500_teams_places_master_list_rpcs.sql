-- Teams + Places + Consumption — follow-up: master-list RPCs
--
-- Master Data → Teams / Places pages are admin config surfaces — they
-- need to show every row regardless of the caller's active-division RLS.
-- Direct SELECTs on warehouse_sub_containers honor the Phase C.3 sub-
-- container-scope RESTRICTIVE policies, which hide rows whose division
-- isn't in the caller's visible set. That's correct for stock-carrying
-- surfaces but wrong here.
--
-- Fix: two SECURITY DEFINER RPCs that bypass RLS and return the shape
-- the master-data pages need. Same D.12 pattern (get_warehouse_sub_containers).
--
-- Prior migration: 20260815000400_teams_places_rpc_consumption.sql

CREATE OR REPLACE FUNCTION public.get_teams_master_list()
RETURNS TABLE (
  id            uuid,
  name          text,
  division_id   uuid,
  division_name text,
  team_id       uuid,
  is_active     boolean,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sc.id,
         sc.name,
         sc.division_id,
         d.name AS division_name,
         sc.team_id,
         sc.is_active,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses      w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions d ON d.id = sc.division_id
  WHERE  w.warehouse_kind = 'teams'
  ORDER  BY d.name, sc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_teams_master_list() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_teams_master_list() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_teams_master_list() IS
'Master Data → Teams list. Returns every team sub-container regardless of
the caller''s active-division RLS. SECURITY DEFINER so the sub-container
scope policies don''t hide cross-division rows on admin surfaces.';

CREATE OR REPLACE FUNCTION public.get_places_master_list()
RETURNS TABLE (
  id            uuid,
  name          text,
  division_id   uuid,
  division_name text,
  is_active     boolean,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sc.id,
         sc.name,
         sc.division_id,
         d.name AS division_name,
         sc.is_active,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses      w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions d ON d.id = sc.division_id
  WHERE  w.warehouse_kind = 'places'
  ORDER  BY d.name, sc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_places_master_list() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_places_master_list() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_places_master_list() IS
'Master Data → Places list. Same shape + rationale as get_teams_master_list().';
