-- Picture Transfer (v2) — source resolution.
-- Returns the REAL warehouses the calling user is a Responsible Person of.
-- SECURITY DEFINER so it bypasses warehouse_responsible_persons RLS (the caller
-- may not be able to read that table directly); it only ever returns the
-- caller's own RP warehouses, resolved via _current_user_data_id().
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_responsible_warehouses()
RETURNS TABLE (id uuid, name text, warehouse_kind text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.name, w.warehouse_kind
  FROM public.warehouse_responsible_persons wrp
  JOIN public.warehouses w ON w.id = wrp.warehouse_id
  WHERE wrp.profile_id = public._current_user_data_id()
    AND COALESCE(w.is_virtual, false) = false
  ORDER BY w.name;
$$;

REVOKE ALL ON FUNCTION public.get_my_responsible_warehouses() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_responsible_warehouses() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
