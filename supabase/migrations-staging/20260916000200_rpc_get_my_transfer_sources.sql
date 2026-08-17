-- Picture Transfer (v2) — source resolution now recognizes SUB-CONTAINER RPs,
-- not just warehouse-level RPs. Returns the (warehouse, sub-container) pairs the
-- caller may send FROM:
--   (a) warehouse-level RP  → every active sub-container of that real warehouse
--   (b) sub-container RP     → that specific active sub-container
-- (warehouse_sub_containers.responsible_person_profile_id = the sub RP).
-- SECURITY DEFINER; real warehouses only (custody/virtual excluded); resolved
-- via _current_user_data_id(); revoke from public.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_transfer_sources()
RETURNS TABLE (warehouse_id uuid, warehouse_name text, sub_container_id uuid, sub_container_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.name, sc.id, sc.name
  FROM public.warehouse_responsible_persons wrp
  JOIN public.warehouses w
    ON w.id = wrp.warehouse_id AND COALESCE(w.is_virtual, false) = false
  JOIN public.warehouse_sub_containers sc
    ON sc.warehouse_id = w.id AND sc.is_active
  WHERE wrp.profile_id = public._current_user_data_id()
  UNION
  SELECT w.id, w.name, sc.id, sc.name
  FROM public.warehouse_sub_containers sc
  JOIN public.warehouses w
    ON w.id = sc.warehouse_id AND COALESCE(w.is_virtual, false) = false
  WHERE sc.responsible_person_profile_id = public._current_user_data_id()
    AND sc.is_active;
$$;

REVOKE ALL ON FUNCTION public.get_my_transfer_sources() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_transfer_sources() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
