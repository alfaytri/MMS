-- Tools & Assets Phase 2: inspection + repair/scrap RPCs + repair-bucket reads.
--
-- record-inspection applies the §6 lifecycle mapping (good->condition Good,
-- bad->condition Fair, under_repair->status maintenance). resolve-repair either
-- returns a unit to service (repaired) or SCRAPS it: close the ledger row
-- (release_reason='scrapped'), retire the unit, then reuse the EXISTING write-off
-- applier (insert a qty-1 write_off stock_adjustments row + approve_stock_adjustment_
-- inventory) so it books an inventory_stock_movements row that rpc_report_pnl reads
-- into the "Scrap & Defective" (v_scrap) line — NO new P&L code. Cost = the unit's
-- receival FIFO layer (via receival_item_id -> receival_items), FIFO-valued by
-- deduct_fifo_layers. Units with no receival link / no stock scrap at zero value
-- (design §8) — the write-off is savepoint-guarded so it NEVER fails the retire.
-- All permission-gated on inventory.catalog.manage (same expr as the Phase-1 RPCs).

BEGIN;

-- ── Record an on-demand condition check ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_record_tool_inspection(
  p_unit_id uuid, p_verdict text, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team uuid; v_status public.tool_status; v_id uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to record inspections' USING errcode = '42501';
  END IF;
  IF p_verdict NOT IN ('good','bad','under_repair') THEN
    RAISE EXCEPTION 'invalid verdict: %', p_verdict;
  END IF;

  SELECT current_custody_location_id, status INTO v_team, v_status
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'cannot inspect a retired unit'; END IF;

  INSERT INTO public.tool_unit_inspections(unit_id, custody_location_id, inspected_by, verdict, notes)
    VALUES (p_unit_id, v_team, public._current_user_data_id(), p_verdict, NULLIF(p_notes,''))
    RETURNING id INTO v_id;

  -- §6 mapping (no new enums): good->Good, bad->Fair, under_repair->maintenance.
  IF p_verdict = 'good' THEN
    UPDATE public.tool_asset_units SET condition = 'Good' WHERE id = p_unit_id;
  ELSIF p_verdict = 'bad' THEN
    UPDATE public.tool_asset_units SET condition = 'Fair' WHERE id = p_unit_id;
  ELSE -- under_repair
    UPDATE public.tool_asset_units SET status = 'maintenance' WHERE id = p_unit_id;
  END IF;

  RETURN v_id;
END $$;

-- ── Resolve a repair: back to service, or scrap (→ P&L) ─────────────────────
CREATE OR REPLACE FUNCTION public.rpc_resolve_tool_repair(
  p_unit_id uuid, p_outcome text, p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.tool_status;
  v_bv uuid; v_sub uuid; v_wh uuid;
  v_actor uuid; v_actor_name text; v_sa uuid;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING errcode = '42501';
  END IF;
  IF p_outcome NOT IN ('repaired','scrap') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome;
  END IF;

  SELECT status INTO v_status FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is already retired'; END IF;

  IF p_outcome = 'repaired' THEN
    -- Back in service: Good again; assigned if still held by a team, else available.
    UPDATE public.tool_asset_units
      SET condition = 'Good',
          status = CASE WHEN current_custody_location_id IS NOT NULL THEN 'assigned'::public.tool_status
                        ELSE 'available'::public.tool_status END
      WHERE id = p_unit_id;
    RETURN;
  END IF;

  -- ── scrap ──
  v_actor := public._current_user_data_id();
  SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_actor;

  -- 1) Close any open custody ledger row + retire + clear the pointer. (Always.)
  UPDATE public.tool_unit_assignments
    SET released_at = now(), release_reason = 'scrapped'
    WHERE unit_id = p_unit_id AND released_at IS NULL;
  UPDATE public.tool_asset_units
    SET status = 'retired', current_custody_location_id = NULL
    WHERE id = p_unit_id;

  -- 2) Resolve the unit's stock position + cost from its receival link.
  SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id
    INTO v_bv, v_sub, v_wh
    FROM public.tool_asset_units u
    JOIN public.receival_items ri ON ri.id = u.receival_item_id
    LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
    WHERE u.id = p_unit_id;

  -- 3) If a costed stock position resolves, post a qty-1 write-off through the
  --    EXISTING applier so it hits P&L v_scrap (FIFO-valued). Savepoint-guarded:
  --    a missing FIFO layer / insufficient stock (seed units, ISSUE-2 drift) must
  --    NOT fail the scrap — the unit stays retired, zero value posted.
  IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
    BEGIN
      INSERT INTO public.stock_adjustments
        (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
         reason, status, requested_by, requested_by_name)
      VALUES
        (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
         COALESCE(NULLIF(p_notes,''), 'Tool scrapped'), 'pending_approval', v_actor, v_actor_name)
      RETURNING id INTO v_sa;

      PERFORM public.approve_stock_adjustment_inventory(v_sa, COALESCE(v_actor_name, 'system'));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'scrap: cost write-off skipped for unit % — %', p_unit_id, SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'scrap: unit % has no receival cost layer — retired at zero value', p_unit_id;
  END IF;
END $$;

-- ── Repair bucket: units under repair (status='maintenance'), division-scoped ─
CREATE OR REPLACE FUNCTION public.get_repair_bucket(p_division_ids uuid[] DEFAULT NULL)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text, condition text,
              division_id uuid, division_name text, current_team_id uuid, current_team_name text,
              last_inspected_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text,
         u.division_id, cd.name, u.current_custody_location_id, sc.name,
         (SELECT max(ins.inspected_at) FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id)
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.company_divisions cd ON cd.id = u.division_id
  LEFT JOIN public.warehouse_sub_containers sc ON sc.id = u.current_custody_location_id
  WHERE u.status = 'maintenance'
    AND (p_division_ids IS NULL OR u.division_id = ANY(p_division_ids))
  ORDER BY cd.name, i.name_en, u.serial_number;
$$;

-- ── A team's units + inspection status (Phase-1 read + last-checked/due) ─────
CREATE OR REPLACE FUNCTION public.get_team_tool_units_v2(p_team_id uuid)
RETURNS TABLE(unit_id uuid, item_name text, serial_number text, brand text,
              condition text, status text, assigned_at timestamptz,
              last_inspected_at timestamptz, inspection_due boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.name_en, u.serial_number, u.brand, u.condition::text, u.status::text,
         (SELECT a.assigned_at FROM public.tool_unit_assignments a
            WHERE a.unit_id = u.id AND a.released_at IS NULL),
         li.last_at,
         (li.last_at IS NULL OR li.last_at < date_trunc('month', now()))
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN LATERAL (
    SELECT max(ins.inspected_at) AS last_at FROM public.tool_unit_inspections ins WHERE ins.unit_id = u.id
  ) li ON true
  WHERE u.current_custody_location_id = p_team_id AND u.status <> 'retired'
  ORDER BY i.name_en, u.serial_number;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_tool_inspection(uuid,text,text) FROM public;
REVOKE ALL ON FUNCTION public.rpc_resolve_tool_repair(uuid,text,text) FROM public;
REVOKE ALL ON FUNCTION public.get_repair_bucket(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.get_team_tool_units_v2(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_record_tool_inspection(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_tool_repair(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_repair_bucket(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_tool_units_v2(uuid) TO authenticated, service_role;

COMMIT;
