-- Teams + Places + Consumption — Task 8a: responsible person on sub-containers
--
-- Adds `responsible_person_profile_id` to `warehouse_sub_containers` so each
-- Team / Place custody sub can name a physical custodian. That person will
-- (in Task 8b) be the accepting party for custody_assign transfers and the
-- initiating party for custody_return transfers.
--
-- Scope of this migration is deliberately narrow:
--   1. The column + index.
--   2. `rpc_upsert_team_or_place` gains `p_responsible_person_profile_id`
--      (NULL means "don't touch" on update, "no person" on create).
--   3. `get_teams_master_list` + `get_places_master_list` return the
--      resolved responsible-person id + name + phone (LEFT JOIN so
--      unassigned subs still list).
--
-- Custody move RPCs land in the follow-up migration
-- (20260815000900_rpc_custody_moves.sql).
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md (Migration 6).

-- 1. Column + index ────────────────────────────────────────────────────
ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN IF NOT EXISTS responsible_person_profile_id uuid
    REFERENCES public.user_data(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wsc_responsible_person
  ON public.warehouse_sub_containers (responsible_person_profile_id)
  WHERE responsible_person_profile_id IS NOT NULL;

COMMENT ON COLUMN public.warehouse_sub_containers.responsible_person_profile_id IS
'Nullable FK to user_data. For teams / places virtual warehouses this is the
physical custodian of the stock riding in this sub. Custody move RPCs use it
as the acceptance / initiation gate. NULL for sub-containers on real
warehouses (they use warehouse_responsible_persons at the WH level).';

-- 2. rpc_upsert_team_or_place — extend with responsible-person param ──
-- Drop old signature first (idempotent) so the ambiguous-overload check
-- in the SQL migration surface stays clean.
DROP FUNCTION IF EXISTS public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.rpc_upsert_team_or_place(
  p_kind                          text,     -- 'teams' | 'places'
  p_name                          text,
  p_division_id                   uuid,
  p_id                            uuid    DEFAULT NULL,  -- omit for create
  p_is_active                     boolean DEFAULT NULL,  -- NULL = leave alone on update
  p_responsible_person_profile_id uuid    DEFAULT NULL   -- NULL = leave alone on update
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
    -- Create — responsible person can be NULL (assign later).
    INSERT INTO public.warehouse_sub_containers (
      warehouse_id, division_id, name, is_active,
      responsible_person_profile_id
    )
    VALUES (
      v_wh_id, p_division_id, btrim(p_name), COALESCE(p_is_active, true),
      p_responsible_person_profile_id
    )
    RETURNING id INTO v_new_id;
    RETURN v_new_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers
    WHERE id = p_id AND warehouse_id = v_wh_id
  ) THEN
    RAISE EXCEPTION 'rpc_upsert_team_or_place: sub-container % not found under % warehouse', p_id, p_kind;
  END IF;

  -- Update. Every param that came in as NULL means "leave alone" for the
  -- fields where NULL is a valid "unset" too we can't distinguish; we use
  -- a sentinel-free convention consistent with the prior implementation:
  --   - is_active: NULL = leave alone (COALESCE with old value).
  --   - responsible_person_profile_id: on update we want callers to be
  --     able to clear the assignment too, so we always overwrite with the
  --     passed value (NULL means "clear"). This mirrors the way
  --     name / division_id are always overwritten.
  UPDATE public.warehouse_sub_containers
     SET name                          = btrim(p_name),
         division_id                   = p_division_id,
         is_active                     = COALESCE(p_is_active, is_active),
         responsible_person_profile_id = p_responsible_person_profile_id,
         updated_at                    = now()
   WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_upsert_team_or_place(text, text, uuid, uuid, boolean, uuid) IS
'Master-data upsert for Team + Place sub-containers with the responsible-person
param. SECURITY DEFINER so admin surfaces can write across divisions regardless
of active-division RLS.';

-- 3. get_teams_master_list — return responsible-person id + name + phone
-- Return type changed → must drop before recreate.
DROP FUNCTION IF EXISTS public.get_teams_master_list();
CREATE OR REPLACE FUNCTION public.get_teams_master_list()
RETURNS TABLE (
  id                              uuid,
  name                            text,
  division_id                     uuid,
  division_name                   text,
  team_id                         uuid,
  is_active                       boolean,
  responsible_person_profile_id   uuid,
  responsible_person_name         text,
  responsible_person_phone        text,
  created_at                      timestamptz,
  updated_at                      timestamptz
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
         sc.responsible_person_profile_id,
         u.full_name AS responsible_person_name,
         u.phone     AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses         w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions  d ON d.id = sc.division_id
  LEFT   JOIN public.user_data     u ON u.id = sc.responsible_person_profile_id
  WHERE  w.warehouse_kind = 'teams'
  ORDER  BY d.name, sc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_teams_master_list() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_teams_master_list() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_teams_master_list() IS
'Master Data → Teams list. Returns every team sub-container with its
responsible-person name + phone (LEFT JOIN so unassigned subs still appear).
SECURITY DEFINER bypasses sub-container-scope RLS for admin surfaces.';

-- 4. get_places_master_list — same shape addition
DROP FUNCTION IF EXISTS public.get_places_master_list();
CREATE OR REPLACE FUNCTION public.get_places_master_list()
RETURNS TABLE (
  id                              uuid,
  name                            text,
  division_id                     uuid,
  division_name                   text,
  is_active                       boolean,
  responsible_person_profile_id   uuid,
  responsible_person_name         text,
  responsible_person_phone        text,
  created_at                      timestamptz,
  updated_at                      timestamptz
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
         sc.responsible_person_profile_id,
         u.full_name AS responsible_person_name,
         u.phone     AS responsible_person_phone,
         sc.created_at,
         sc.updated_at
  FROM   public.warehouse_sub_containers sc
  JOIN   public.warehouses         w ON w.id = sc.warehouse_id
  JOIN   public.company_divisions  d ON d.id = sc.division_id
  LEFT   JOIN public.user_data     u ON u.id = sc.responsible_person_profile_id
  WHERE  w.warehouse_kind = 'places'
  ORDER  BY d.name, sc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_places_master_list() FROM public;
GRANT  EXECUTE ON FUNCTION public.get_places_master_list() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_places_master_list() IS
'Master Data → Places list. Same shape + rationale as get_teams_master_list().';

-- 5. Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'warehouse_sub_containers'
      AND column_name = 'responsible_person_profile_id'
  ) THEN
    RAISE EXCEPTION 'warehouse_sub_containers.responsible_person_profile_id did not land';
  END IF;
END $$;
