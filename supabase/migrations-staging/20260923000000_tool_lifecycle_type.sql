-- Tools & Assets Phase 2 rework — lifecycle type (New / Used / Repaired).
--
-- A per-unit lifecycle axis SEPARATE from `condition` (Good/Fair): a unit can be
-- Used + Good. Auto-advances new->used on first team assignment (here) and
-- ->repaired on a usable return from repair (migration 20260923000200). A manual
-- override lives in the unit editor. Also surfaces lifecycle_type through the two
-- read RPCs the team view + assign picker consume (return-shape change => DROP+CREATE,
-- rebased on the live bodies).

BEGIN;

-- 1) Lifecycle enum + column.
DO $$ BEGIN
  CREATE TYPE public.tool_lifecycle_type AS ENUM ('new','used','repaired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS lifecycle_type public.tool_lifecycle_type NOT NULL DEFAULT 'new';

-- Backfill (staging test data only; new-prod has 0 units): anything ever assigned
-- is at least "used"; fresh, never-assigned units keep 'new'.
UPDATE public.tool_asset_units u
   SET lifecycle_type = 'used'
 WHERE u.lifecycle_type = 'new'
   AND EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id);

-- 2) Assign advances new -> used (first time the unit goes into service).
--    Rebased on the live body (tools.assets.manage gate) — only the SET clause of
--    the final UPDATE gains a lifecycle_type column; everything else byte-identical.
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to assign tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status INTO v_unit_div, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be assigned'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_team_id; END IF;

  IF v_unit_div IS NOT NULL AND v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division assignment blocked: the tool belongs to a different division than this team (use Transfer to change the tool''s division first)';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tool_unit_assignments WHERE unit_id = p_unit_id AND released_at IS NULL) THEN
    RAISE EXCEPTION 'tool unit is already assigned to a team — move or return it first';
  END IF;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_team_id,
        status = 'assigned',
        division_id = COALESCE(division_id, v_team_div),
        lifecycle_type = CASE WHEN lifecycle_type = 'new' THEN 'used'::public.tool_lifecycle_type ELSE lifecycle_type END
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;

-- 3) Read RPCs surface lifecycle_type (append one column; return-shape change =>
--    DROP+CREATE, rebased on the live bodies). Grants re-applied after.
DROP FUNCTION IF EXISTS public.get_team_tool_units_v2(uuid);
CREATE FUNCTION public.get_team_tool_units_v2(p_team_id uuid)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text,
              condition text, status text, assigned_at timestamptz,
              last_inspected_at timestamptz, inspection_due boolean, lifecycle_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL),
         li.last_at,
         (li.last_at IS NULL OR li.last_at < date_trunc('month', now())),
         u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN LATERAL (
    SELECT max(ins.inspected_at) AS last_at FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id
  ) li ON true
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$function$;

DROP FUNCTION IF EXISTS public.get_assignable_tool_units(uuid, text);
CREATE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL::text)
RETURNS TABLE(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text,
              serial_number text, brand text, condition text, lifecycle_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT u.id, i.id, i.name_en, c.id, c.name_en, u.serial_number, u.brand, u.condition::text, u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status <> 'retired'
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY c.name_en, i.name_en, u.serial_number
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.get_team_tool_units_v2(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_assignable_tool_units(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_tool_units_v2(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_assignable_tool_units(uuid, text) TO authenticated, service_role;

COMMIT;
