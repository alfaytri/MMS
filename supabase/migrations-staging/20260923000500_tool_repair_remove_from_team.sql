-- Tools & Assets Phase 2 rework — a tool in repair LEAVES the team.
--
-- Operator correction (2026-08-19): sending a tool for repair collects it OUT of
-- the team (it should not linger on the team's list). So send-to-bucket now CLOSES
-- the team assignment (release_reason='sent_for_repair') + clears the custody
-- pointer + sets status='maintenance'. The tool then shows ONLY in the Repair
-- bucket (with the team it came from), not on the team.
--
-- Downstream, everything derives the "from team" from that just-closed
-- 'sent_for_repair' ledger row instead of an open assignment:
--   - rpc_send_tool_for_repair: from = the latest assignment's team + warehouse.
--   - get_repair_bucket: shows the from-team via the latest 'sent_for_repair' row.
--   - rpc_return_tool_from_repair (usable): stamps the return store on that row.
--   - get_assignable_tool_units: excludes maintenance units (a tool in repair is
--     not assignable even though it now has no open assignment).

BEGIN;

-- Allow the new release reason.
ALTER TABLE public.tool_unit_assignments DROP CONSTRAINT IF EXISTS tool_unit_assignments_release_reason_check;
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_release_reason_check
  CHECK (release_reason IN ('moved','returned','scrapped','sent_for_repair'));

-- 1) Collect OUT of the team.
CREATE OR REPLACE FUNCTION public.rpc_send_tool_to_repair_bucket(p_unit_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status public.tool_status;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to send tools for repair' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is retired'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = p_unit_id AND a.released_at IS NULL) THEN
    RAISE EXCEPTION 'only a tool currently held by a team can be sent for repair';
  END IF;

  -- Close the assignment (keeps which team it came from) + remove it from the team.
  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'sent_for_repair', notes = COALESCE(p_notes, notes)
    WHERE unit_id = p_unit_id AND released_at IS NULL;
  UPDATE public.tool_asset_units
    SET status = 'maintenance', current_custody_location_id = NULL
    WHERE id = p_unit_id;
END $function$;

-- 2) Send to vendor: from = the team it was collected from (latest assignment).
CREATE OR REPLACE FUNCTION public.rpc_send_tool_for_repair(
  p_unit_id uuid, p_repair_vendor_id uuid, p_expected_return_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id();
  v_status public.tool_status;
  v_vendor record; v_from_sub uuid; v_from_wh uuid; v_num text; v_tid uuid;
BEGIN
  IF NOT public._user_has_permission(v_uid, 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to send tools for repair' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tool unit % not found', p_unit_id; END IF;
  IF v_status <> 'maintenance' THEN
    RAISE EXCEPTION 'tool must be in the Repair bucket (maintenance) before sending to a vendor';
  END IF;
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

-- 3) Return from vendor. The team assignment is already closed; usable stamps the
--    return store on the 'sent_for_repair' row.
CREATE OR REPLACE FUNCTION public.rpc_return_tool_from_repair(
  p_transfer_id uuid, p_outcome text, p_to_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text
) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id(); v_actor_name text;
  v_unit uuid; v_kind text; v_tstatus text;
  v_bv uuid; v_sub uuid; v_wh uuid; v_sa uuid;
BEGIN
  IF NOT public._user_has_permission(v_uid, 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('usable','writeoff') THEN RAISE EXCEPTION 'invalid outcome: %', p_outcome; END IF;

  SELECT tool_unit_id, transfer_kind, status::text INTO v_unit, v_kind, v_tstatus
    FROM public.warehouse_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer % not found', p_transfer_id; END IF;
  IF v_unit IS NULL OR v_kind <> 'damaged_repair_out' THEN RAISE EXCEPTION 'transfer % is not a tool repair transfer', p_transfer_id; END IF;
  IF v_tstatus <> 'in_transit' THEN RAISE EXCEPTION 'transfer % is not out for repair (status %)', p_transfer_id, v_tstatus; END IF;

  IF p_outcome = 'usable' THEN
    -- Record the destination store on the collection ledger row.
    UPDATE public.tool_unit_assignments
      SET returned_to_warehouse_id = p_to_warehouse_id
      WHERE id = (SELECT a.id FROM public.tool_unit_assignments a
                  WHERE a.unit_id = v_unit AND a.release_reason = 'sent_for_repair'
                  ORDER BY a.released_at DESC NULLS LAST LIMIT 1);
    UPDATE public.tool_asset_units
      SET status = 'available', condition = 'Good',
          lifecycle_type = 'repaired'::public.tool_lifecycle_type,
          current_custody_location_id = NULL
      WHERE id = v_unit;
  ELSE
    -- writeoff -> retire + scrap->P&L (the assignment is already closed).
    SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_uid;
    UPDATE public.tool_asset_units
      SET status = 'retired', current_custody_location_id = NULL
      WHERE id = v_unit;

    SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id INTO v_bv, v_sub, v_wh
      FROM public.tool_asset_units u
      JOIN public.receival_items ri ON ri.id = u.receival_item_id
      LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
      WHERE u.id = v_unit;

    IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
      BEGIN
        INSERT INTO public.stock_adjustments
          (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
           reason, status, requested_by, requested_by_name)
        VALUES
          (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
           COALESCE(NULLIF(p_notes,''), 'Tool scrapped (repair writeoff)'), 'pending_approval', v_uid, v_actor_name)
        RETURNING id INTO v_sa;
        PERFORM public.approve_stock_adjustment_inventory(v_sa, COALESCE(v_actor_name, 'system'));
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'writeoff: cost write-off skipped for unit % — %', v_unit, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'writeoff: unit % has no receival cost layer — retired at zero value', v_unit;
    END IF;
  END IF;

  UPDATE public.warehouse_transfers
    SET status = 'received', received_at = now(), received_by_profile_id = v_uid
    WHERE id = p_transfer_id;
END $function$;

-- 4) Repair bucket: awaiting-vendor units, showing the team they came from
--    (custody is now cleared, so derive it from the 'sent_for_repair' row).
DROP FUNCTION IF EXISTS public.get_repair_bucket(uuid[]);
CREATE FUNCTION public.get_repair_bucket(p_division_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text,
              division_id uuid, division_name text, current_team_id uuid, current_team_name text,
              last_inspected_at timestamptz, lifecycle_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text,
         u.division_id, cd.name, la.team_id, sc.name,
         (SELECT max(ins.inspected_at) FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id),
         u.lifecycle_type::text
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

-- 5) A tool in repair (maintenance, no open assignment) must NOT be assignable.
CREATE OR REPLACE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL::text)
RETURNS TABLE(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text,
              serial_number text, brand text, condition text, lifecycle_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT u.id, i.id, i.name_en, c.id, c.name_en, u.serial_number, u.brand, u.condition::text, u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status NOT IN ('retired','maintenance')
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY c.name_en, i.name_en, u.serial_number
  LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.rpc_send_tool_to_repair_bucket(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_send_tool_for_repair(uuid, uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_from_repair(uuid, text, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.get_repair_bucket(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_assignable_tool_units(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_send_tool_to_repair_bucket(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_send_tool_for_repair(uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_from_repair(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_repair_bucket(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_assignable_tool_units(uuid, text) TO authenticated, service_role;

COMMIT;
