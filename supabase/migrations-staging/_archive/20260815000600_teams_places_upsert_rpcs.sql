-- Teams + Places + Consumption — follow-up: master-data upsert RPCs
--
-- Symptom: creating a Place (or Team) under a division outside the caller's
-- active-division set raised
--   "new row violates row-level security policy sub_container_scope_insert_r
--    for table warehouse_sub_containers".
--
-- Same class of problem as the SELECT bypass we already shipped:
-- Master Data admin surfaces need cross-division visibility AND write.
--
-- Fix: SECURITY DEFINER upsert + toggle-active RPCs that resolve the
-- shared virtual warehouse by kind ('teams' | 'places'), then insert or
-- update the sub-container bypassing the sub_container_scope_*_r policies.
-- Unique-name-per-warehouse conflicts still fire as 23505 (client maps to
-- the friendly "already exists" toast).
--
-- Prior migration: 20260815000500_teams_places_master_list_rpcs.sql

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
    -- Create
    INSERT INTO public.warehouse_sub_containers (warehouse_id, division_id, name, is_active)
    VALUES (v_wh_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true))
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  -- Update. Verify the sub actually belongs to the shared warehouse of the
  -- requested kind so a rogue payload can't mutate an unrelated row.
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

-- Drop the old signature that shipped in the initial version of this
-- migration (positional order was different). Idempotent.
DROP FUNCTION IF EXISTS public.rpc_upsert_team_or_place(text, uuid, text, uuid, boolean);

REVOKE EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean) IS
'Master-data upsert for Team and Place sub-containers. SECURITY DEFINER so
admin surfaces can create/update rows in any division regardless of the
caller''s active-division RLS. Rejects payloads that target unrelated
sub-containers (id must belong to the shared warehouse matching p_kind).';
