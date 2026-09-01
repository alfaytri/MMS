-- 20261047000000_block_pending_scrap_units.sql  (Phase 2, Task 4)
--
-- Lock a unit that is pending_scrap (a scrap write-off awaiting warehouse
-- approval) everywhere it could otherwise move or leave inventory, and surface
-- the lock in the repair bucket:
--   * get_assignable_tool_units   — exclude pending_scrap units from the picker.
--   * rpc_assign_tool_unit_to_team — RAISE if pending_scrap.
--   * rpc_move_tool_unit_to_team   — RAISE if pending_scrap; also add the missing
--                                    retired guard (it read no status before).
--   * rpc_send_tool_for_repair     — RAISE if pending_scrap.
--   * get_repair_bucket            — return u.pending_scrap so the UI can badge +
--                                    disable actions (return-type change -> DROP+CREATE).
--
-- Full CREATE OR REPLACE of the live bodies (verified byte-identical staging=prod
-- before apply). Idempotent. maintenance-move is intentionally NOT blocked here
-- (get_assignable already excludes maintenance, so no UI reaches it).

-- 1) assignable picker: hide locked units
CREATE OR REPLACE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text, serial_number text, brand text, condition text, lifecycle_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.id, i.name_en, c.id, c.name_en, u.serial_number, u.brand, u.condition::text, u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status NOT IN ('retired','maintenance')
    AND u.pending_scrap = false
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY c.name_en, i.name_en, u.serial_number
  LIMIT 200;
$function$;

-- 2) assign: block a locked unit
CREATE OR REPLACE FUNCTION public.rpc_assign_tool_unit_to_team(p_unit_id uuid, p_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_pending boolean; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to assign tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status, pending_scrap INTO v_unit_div, v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be assigned'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

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
        division_id = COALESCE(division_id, v_team_div)
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;

-- 3) move: block a locked unit (+ add the missing retired guard)
CREATE OR REPLACE FUNCTION public.rpc_move_tool_unit_to_team(p_unit_id uuid, p_to_team_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_unit_div uuid; v_team_div uuid; v_status public.tool_status; v_pending boolean; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to move tools' USING ERRCODE = '42501';
  END IF;

  SELECT division_id, status, pending_scrap INTO v_unit_div, v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'tool unit is retired and cannot be moved'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

  SELECT division_id INTO v_team_div FROM public.warehouse_sub_containers WHERE id = p_to_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team_id; END IF;

  IF v_unit_div IS DISTINCT FROM v_team_div THEN
    RAISE EXCEPTION 'cross-division move blocked: destination team is in a different division than the tool';
  END IF;

  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'moved'
    WHERE unit_id = p_unit_id AND released_at IS NULL;

  INSERT INTO public.tool_unit_assignments(unit_id, custody_location_id, assigned_by, notes)
    VALUES (p_unit_id, p_to_team_id, public._current_user_data_id(), p_notes)
    RETURNING id INTO v_id;

  UPDATE public.tool_asset_units
    SET current_custody_location_id = p_to_team_id, status = 'assigned'
    WHERE id = p_unit_id;

  RETURN v_id;
END $function$;

-- 4) send-for-repair: block a locked unit
CREATE OR REPLACE FUNCTION public.rpc_send_tool_for_repair(p_unit_id uuid, p_repair_vendor_id uuid, p_expected_return_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id();
  v_status public.tool_status;
  v_pending boolean;
  v_vendor record; v_from_sub uuid; v_from_wh uuid; v_num text; v_tid uuid;
BEGIN
  IF NOT public._user_has_permission(v_uid, 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to send tools for repair' USING ERRCODE = '42501';
  END IF;
  SELECT status, pending_scrap INTO v_status, v_pending FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status <> 'maintenance' THEN
    RAISE EXCEPTION 'tool must be in the Repair bucket (maintenance) before sending to a vendor';
  END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.warehouse_transfers wt
             WHERE wt.tool_unit_id = p_unit_id AND wt.transfer_kind = 'damaged_repair_out' AND wt.status = 'in_transit') THEN
    RAISE EXCEPTION 'tool is already out for repair';
  END IF;

  SELECT id, virtual_warehouse_id, sub_container_id, is_active INTO v_vendor
    FROM public.repair_vendors WHERE id = p_repair_vendor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'repair vendor % not found', p_repair_vendor_id; END IF;
  IF NOT v_vendor.is_active THEN RAISE EXCEPTION 'repair vendor is inactive'; END IF;
  IF v_vendor.virtual_warehouse_id IS NULL OR v_vendor.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'repair vendor % has no virtual warehouse / sub_container', p_repair_vendor_id;
  END IF;

  -- from = the team the tool was last with (its most recent assignment).
  SELECT a.custody_location_id, sc.warehouse_id INTO v_from_sub, v_from_wh
    FROM public.tool_unit_assignments a
    JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
    WHERE a.unit_id = p_unit_id
    ORDER BY a.assigned_at DESC
    LIMIT 1;
  IF v_from_sub IS NULL THEN
    RAISE EXCEPTION 'cannot determine the tool''s origin team (from-location) for the repair transfer';
  END IF;

  v_num := public.generate_transfer_number();
  INSERT INTO public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id, status, date, notes,
    transfer_kind, repair_vendor_id, expected_return_date, tool_unit_id,
    from_sub_container_id, to_sub_container_id, created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) VALUES (
    v_num, v_from_wh, v_vendor.virtual_warehouse_id, 'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_expected_return_date, p_unit_id,
    v_from_sub, v_vendor.sub_container_id, v_uid, v_uid, now()
  ) RETURNING id INTO v_tid;

  RETURN v_tid;
END $function$;

-- 5) repair bucket: expose pending_scrap so the UI can badge + disable (return
--    type changes -> DROP + CREATE)
DROP FUNCTION IF EXISTS public.get_repair_bucket(uuid[]);
CREATE FUNCTION public.get_repair_bucket(p_division_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text, division_id uuid, division_name text, current_team_id uuid, current_team_name text, last_inspected_at timestamp with time zone, lifecycle_type text, pending_scrap boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text,
         u.division_id, cd.name, la.team_id, sc.name,
         (SELECT max(ins.inspected_at) FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id),
         u.lifecycle_type::text, u.pending_scrap
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = u.division_id
  LEFT JOIN LATERAL (
    SELECT a.custody_location_id AS team_id
    FROM public.tool_unit_assignments a
    WHERE a.unit_id = u.id AND a.release_reason = 'sent_for_repair'
    ORDER BY a.released_at DESC NULLS LAST LIMIT 1
  ) la ON true
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = la.team_id
  WHERE u.status = 'maintenance'
    AND NOT EXISTS (SELECT 1 FROM public.warehouse_transfers wt
                    WHERE wt.tool_unit_id = u.id AND wt.transfer_kind = 'damaged_repair_out' AND wt.status = 'in_transit')
    AND (p_division_ids IS NULL OR u.division_id = ANY(p_division_ids))
  ORDER BY cd.name, i.name_en, u.serial_number;
$function$;

NOTIFY pgrst, 'reload schema';
