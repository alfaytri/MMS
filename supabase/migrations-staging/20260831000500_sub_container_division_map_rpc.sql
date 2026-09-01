-- Division-scoped visibility needs a COMPLETE sub-container -> division map on the
-- client so useDivisionScopedVisibility can HIDE other divisions' rows across the
-- warehouse tabs. It used to read the warehouse_sub_container_totals view assuming
-- that view bypassed RLS. The 2026-08-26 anon-exposure fix (C1) made that view
-- security_invoker=true (RLS-scoped), so under a division filter it returns only the
-- active division's sub-containers -> the client map became INCOMPLETE ->
-- useDivisionScopedVisibility's null-safe fallback let other-division stock leak
-- through the filter (rendering as "Unassigned" in the warehouse stock tree).
--
-- This SECURITY DEFINER RPC restores the complete mapping WITHOUT reopening the C1
-- hole: it returns metadata only (no stock counts / quantities / values) and is
-- granted to authenticated users only (never anon). The client needs to know which
-- sub-container belongs to which division precisely so it can hide the ones outside
-- the active-division view.
CREATE OR REPLACE FUNCTION public.get_sub_container_division_map()
RETURNS TABLE (sub_container_id uuid, warehouse_id uuid, division_id uuid, is_active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
  SELECT id, warehouse_id, division_id, is_active
  FROM public.warehouse_sub_containers;
$function$;

REVOKE ALL ON FUNCTION public.get_sub_container_division_map() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sub_container_division_map() TO authenticated;

NOTIFY pgrst, 'reload schema';
