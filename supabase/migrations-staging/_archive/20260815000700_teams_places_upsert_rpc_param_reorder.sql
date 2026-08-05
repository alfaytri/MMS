-- Teams + Places + Consumption — follow-up: reorder rpc_upsert_team_or_place params
--
-- The initial upsert RPC put p_id (nullable) BEFORE p_name / p_division_id
-- (required), which meant PostgREST-generated TypeScript typed p_id as
-- required `string`. Callers passed undefined for the "create" path and
-- tsc rejected the payload.
--
-- Fix: reorder so p_id ships at position 4 with DEFAULT NULL — required
-- params come first, optional ones last. Client can omit p_id / p_is_active
-- for create; pass them for update.
--
-- Prior migration: 20260815000600_teams_places_upsert_rpcs.sql

DROP FUNCTION IF EXISTS public.rpc_upsert_team_or_place(text, uuid, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.rpc_upsert_team_or_place(
  p_kind        text,                  -- 'teams' | 'places'
  p_name        text,
  p_division_id uuid,
  p_id          uuid    DEFAULT NULL,  -- omit for create, pass existing id for update
  p_is_active   boolean DEFAULT NULL   -- NULL means don't touch is_active on update
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wh_id  uuid;
  v_new_id uuid;
BEGIN
  IF p_kind NOT IN ('teams', 'places') THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: kind must be teams or places (got %)', p_kind;
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: name is required';
  END IF;
  IF p_division_id IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: division_id is required';
  END IF;

  SELECT id INTO v_wh_id
  FROM   public.warehouses
  WHERE  warehouse_kind = p_kind;

  IF v_wh_id IS NULL THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: shared % warehouse not found (seed migration missing?)', p_kind;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.warehouse_sub_containers (warehouse_id, division_id, name, is_active)
    VALUES (v_wh_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true))
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers
    WHERE id = p_id AND warehouse_id = v_wh_id
  ) THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: sub-container % not found under % warehouse', p_id, p_kind;
  END IF;

  UPDATE public.warehouse_sub_containers
     SET name        = btrim(p_name),
         division_id = p_division_id,
         is_active   = COALESCE(p_is_active, is_active),
         updated_at  = now()
   WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) IS
'Master-data upsert for Team and Place sub-containers. SECURITY DEFINER
so admin surfaces can create/update rows in any division regardless of the
caller''s active-division RLS. Required params first (kind, name, division_id);
optional ones (id, is_active) default to NULL for the create path.';
