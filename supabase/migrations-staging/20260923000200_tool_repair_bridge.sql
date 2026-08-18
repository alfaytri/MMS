-- Tools & Assets Phase 2 rework — serialized-tool repair bridge.
--
-- A serialized tool reuses the existing damaged_repair_out warehouse_transfers
-- record so it shows in Damaged Stock -> Out for Repair alongside damaged items,
-- but keyed by tool_unit_id (NO sales-return disposition, NO bulk damaged-stock
-- ledger, NO transfer_items row — tools carry no brand-variant qty; the overview
-- reads tool rows via tool_unit_id in the frontend).
--
-- Lifecycle (the tool's team assignment stays OPEN through repair — status marks it):
--   assigned --send_to_repair_bucket--> maintenance (Repair bucket, awaiting vendor)
--           --send_for_repair--------> maintenance + open damaged_repair_out transfer (Out for Repair)
--           --return_from_repair-----> usable: available + Repaired, returned to a store (assignment closed 'returned')
--                                       writeoff: retired + scrap->P&L (assignment closed 'scrapped')
-- Keeping the assignment open gives the from-side for the vendor transfer and the
-- team's "In repair" section for free (no release_reason CHECK change needed).

BEGIN;

-- Bridge column.
ALTER TABLE public.warehouse_transfers
  ADD COLUMN IF NOT EXISTS tool_unit_id uuid REFERENCES public.tool_asset_units(id);

CREATE INDEX IF NOT EXISTS ix_warehouse_transfers_tool_unit
  ON public.warehouse_transfers (tool_unit_id) WHERE tool_unit_id IS NOT NULL;

-- 1) Collect a team's tool into the Repair bucket (awaiting vendor). Requires the
--    tool be currently held by a team; the assignment stays open (custody = team),
--    status='maintenance' marks it pulled from service.
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
  UPDATE public.tool_asset_units SET status = 'maintenance' WHERE id = p_unit_id;
END $function$;

-- 2) Send a bucket tool to a vendor: write the damaged_repair_out transfer keyed by
--    tool_unit_id. from = the open assignment's team (+ its warehouse); to = the
--    vendor's virtual warehouse + sub_container. No damaged ledger, no items row.
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

  SELECT a.custody_location_id, sc.warehouse_id INTO v_from_sub, v_from_wh
    FROM public.tool_unit_assignments a
    JOIN public.warehouse_sub_containers sc ON sc.id = a.custody_location_id
    WHERE a.unit_id = p_unit_id AND a.released_at IS NULL
    LIMIT 1;
  IF v_from_sub IS NULL THEN
    RAISE EXCEPTION 'cannot determine the tool''s current team (from-location) for the repair transfer';
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

-- 3) Return a tool from a vendor. usable -> back to a store (Repaired); writeoff ->
--    retire + scrap->P&L (reuses the write-off applier, savepoint-guarded). Closes
--    the still-open team assignment either way.
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
    UPDATE public.tool_unit_assignments
      SET released_at = now(), release_reason = 'returned', returned_to_warehouse_id = p_to_warehouse_id,
          notes = COALESCE(p_notes, notes)
      WHERE unit_id = v_unit AND released_at IS NULL;
    UPDATE public.tool_asset_units
      SET status = 'available', condition = 'Good',
          lifecycle_type = 'repaired'::public.tool_lifecycle_type,
          current_custody_location_id = NULL
      WHERE id = v_unit;
  ELSE
    -- writeoff -> retire + scrap->P&L (mirror of rpc_resolve_tool_repair's scrap block).
    SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_uid;
    UPDATE public.tool_unit_assignments
      SET released_at = now(), release_reason = 'scrapped'
      WHERE unit_id = v_unit AND released_at IS NULL;
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

-- 4) Repair bucket = awaiting-vendor units only (maintenance, NO open repair
--    transfer); adds lifecycle_type. Return-shape change => DROP+CREATE.
DROP FUNCTION IF EXISTS public.get_repair_bucket(uuid[]);
CREATE FUNCTION public.get_repair_bucket(p_division_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text,
              division_id uuid, division_name text, current_team_id uuid, current_team_name text,
              last_inspected_at timestamptz, lifecycle_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text,
         u.division_id, cd.name, u.current_custody_location_id, sc.name,
         (SELECT max(ins.inspected_at) FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id),
         u.lifecycle_type::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = u.division_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE u.status = 'maintenance'
    AND NOT EXISTS (SELECT 1 FROM public.warehouse_transfers wt
                    WHERE wt.tool_unit_id = u.id AND wt.transfer_kind = 'damaged_repair_out' AND wt.status = 'in_transit')
    AND (p_division_ids IS NULL OR u.division_id = ANY(p_division_ids))
  ORDER BY cd.name, i.name_en, u.serial_number;
$function$;

REVOKE ALL ON FUNCTION public.rpc_send_tool_to_repair_bucket(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_send_tool_for_repair(uuid, uuid, date, text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_return_tool_from_repair(uuid, text, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.get_repair_bucket(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_send_tool_to_repair_bucket(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_send_tool_for_repair(uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_return_tool_from_repair(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_repair_bucket(uuid[]) TO authenticated, service_role;

COMMIT;
