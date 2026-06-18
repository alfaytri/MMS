-- RPC to check is_division_manager flag.
-- Bypasses PostgREST schema cache which may not recognize new columns immediately.
CREATE OR REPLACE FUNCTION public.check_is_division_manager(p_profile_id uuid)
RETURNS boolean AS $$
  SELECT COALESCE(is_division_manager, false) FROM public.profiles WHERE id = p_profile_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_is_division_manager(uuid) TO authenticated;
