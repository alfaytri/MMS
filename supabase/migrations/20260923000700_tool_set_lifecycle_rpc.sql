-- Tools & Assets Phase 2 rework — manual lifecycle-type override RPC.
--
-- Lets the operator set a unit's New/Used/Repaired directly from the team tool row
-- (a three-dot menu), gated on tools.assets.manage — the same manual override the
-- unit editor offers, reachable without the item context.

CREATE OR REPLACE FUNCTION public.rpc_set_tool_lifecycle_type(p_unit_id uuid, p_lifecycle_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to change the tool type' USING ERRCODE = '42501';
  END IF;
  IF p_lifecycle_type NOT IN ('new','used','repaired') THEN
    RAISE EXCEPTION 'invalid lifecycle type: %', p_lifecycle_type;
  END IF;
  UPDATE public.tool_asset_units
    SET lifecycle_type = p_lifecycle_type::public.tool_lifecycle_type
    WHERE id = p_unit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
END $function$;

REVOKE ALL ON FUNCTION public.rpc_set_tool_lifecycle_type(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_set_tool_lifecycle_type(uuid, text) TO authenticated, service_role;
