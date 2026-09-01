-- 20261046000000_gate_tool_scrap_rpcs.sql  (Phase 2, Task 3)
--
-- Reroute the two serialized-tool scrap paths through the warehouse approval
-- chain instead of self-approving:
--   * rpc_resolve_tool_repair  (outcome 'scrap')
--   * rpc_return_tool_from_repair (outcome 'writeoff')
--
-- BEFORE: retire the unit immediately + PERFORM approve_stock_adjustment_inventory
-- in the same txn (empty chain = self-approve).
-- AFTER: resolve the unit's cost position FIRST, then split —
--   * COSTED unit  -> set pending_scrap=true (do NOT retire), insert a
--     pending_approval write_off linked via tool_unit_id, and build the standard
--     stock_adj approval chain. trg_tool_scrap_on_adjustment (migration ...45)
--     retires the unit + closes its assignment when the write_off is approved,
--     or releases the lock if rejected. No self-approve here.
--   * UNCOSTED unit (seed / no receival cost layer) -> retire immediately at zero
--     value, as today (owner decision: nothing to cost, so nothing to gate).
--
-- Full CREATE OR REPLACE of each function (drift-proof: transforms the live body
-- fetched at implementation time; prod body verified identical before apply).
-- Idempotent by nature. Keeps the tools.assets.manage permission guard.
-- rpc_resolve also gains a re-scrap guard (a unit already pending_scrap can't be
-- scrapped again into a second SA).

CREATE OR REPLACE FUNCTION public.rpc_resolve_tool_repair(p_unit_id uuid, p_outcome text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.tool_status;
  v_pending boolean;
  v_bv uuid; v_sub uuid; v_wh uuid;
  v_actor uuid; v_actor_name text; v_sa uuid;
  v_step RECORD; v_ord int := 0;
BEGIN
  IF NOT public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage') THEN
    RAISE EXCEPTION 'not authorized to resolve repairs' USING errcode = '42501';
  END IF;
  IF p_outcome NOT IN ('repaired','scrap') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome;
  END IF;

  SELECT status, pending_scrap INTO v_status, v_pending
    FROM public.tool_asset_units WHERE id = p_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unit % not found', p_unit_id; END IF;
  IF v_status = 'retired' THEN RAISE EXCEPTION 'unit is already retired'; END IF;
  IF v_pending THEN RAISE EXCEPTION 'unit is pending scrap approval' USING ERRCODE = 'P0001'; END IF;

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

  -- Resolve the unit's stock position + cost from its receival link.
  SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id
    INTO v_bv, v_sub, v_wh
    FROM public.tool_asset_units u
    JOIN public.receival_items ri ON ri.id = u.receival_item_id
    LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
    WHERE u.id = p_unit_id;

  IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
    -- GATED: lock the unit and route a pending write_off through the stock_adj
    -- approval chain. The unit is NOT retired here — trg_tool_scrap_on_adjustment
    -- retires it (and closes the assignment) on approval, or releases the lock
    -- on rejection.
    UPDATE public.tool_asset_units SET pending_scrap = true WHERE id = p_unit_id;

    INSERT INTO public.stock_adjustments
      (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
       reason, status, requested_by, requested_by_name, tool_unit_id)
    VALUES
      (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
       COALESCE(NULLIF(p_notes,''), 'Tool scrapped'), 'pending_approval', v_actor, v_actor_name, p_unit_id)
    RETURNING id INTO v_sa;

    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   public.approval_workflow_steps
      WHERE  workflow = 'stock_adj' AND is_active = true AND archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;
      v_ord := v_ord + 1;
      INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
      VALUES (v_sa, v_ord, v_step.step_key, v_step.step_label);
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
    END IF;
  ELSE
    -- UNCOSTED (seed / no receival cost layer): nothing to cost, so retire
    -- immediately at zero value (owner decision), closing any open assignment.
    UPDATE public.tool_unit_assignments
      SET released_at = now(), release_reason = 'scrapped'
      WHERE unit_id = p_unit_id AND released_at IS NULL;
    UPDATE public.tool_asset_units
      SET status = 'retired', current_custody_location_id = NULL
      WHERE id = p_unit_id;
    RAISE NOTICE 'scrap: unit % has no receival cost layer — retired at zero value', p_unit_id;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_return_tool_from_repair(p_transfer_id uuid, p_outcome text, p_to_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._current_user_data_id(); v_actor_name text;
  v_unit uuid; v_kind text; v_tstatus text;
  v_bv uuid; v_sub uuid; v_wh uuid; v_sa uuid;
  v_step RECORD; v_ord int := 0;
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
    -- ── writeoff ──
    SELECT full_name INTO v_actor_name FROM public.user_data WHERE id = v_uid;

    SELECT ri.brand_variant_id, ri.sub_container_id, sc.warehouse_id INTO v_bv, v_sub, v_wh
      FROM public.tool_asset_units u
      JOIN public.receival_items ri ON ri.id = u.receival_item_id
      LEFT JOIN public.warehouse_sub_containers sc ON sc.id = ri.sub_container_id
      WHERE u.id = v_unit;

    IF v_bv IS NOT NULL AND v_sub IS NOT NULL AND v_wh IS NOT NULL THEN
      -- GATED: lock + route a pending write_off; the trigger retires on approve.
      UPDATE public.tool_asset_units SET pending_scrap = true WHERE id = v_unit;

      INSERT INTO public.stock_adjustments
        (warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
         reason, status, requested_by, requested_by_name, tool_unit_id)
      VALUES
        (v_wh, v_sub, v_bv, 'write_off'::public.stock_adjustment_type, 1,
         COALESCE(NULLIF(p_notes,''), 'Tool scrapped (repair writeoff)'), 'pending_approval', v_uid, v_actor_name, v_unit)
      RETURNING id INTO v_sa;

      FOR v_step IN
        SELECT step_key, step_label, is_conditional, condition_types
        FROM   public.approval_workflow_steps
        WHERE  workflow = 'stock_adj' AND is_active = true AND archived_at IS NULL
        ORDER BY step_order
      LOOP
        IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
          CONTINUE;
        END IF;
        v_ord := v_ord + 1;
        INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
        VALUES (v_sa, v_ord, v_step.step_key, v_step.step_label);
      END LOOP;

      IF v_ord = 0 THEN
        RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
      END IF;
    ELSE
      -- UNCOSTED: retire immediately at zero value (owner decision).
      UPDATE public.tool_asset_units
        SET status = 'retired', current_custody_location_id = NULL
        WHERE id = v_unit;
      RAISE NOTICE 'writeoff: unit % has no receival cost layer — retired at zero value', v_unit;
    END IF;
  END IF;

  -- The tool physically returned either way — close the repair transfer.
  UPDATE public.warehouse_transfers
    SET status = 'received', received_at = now(), received_by_profile_id = v_uid
    WHERE id = p_transfer_id;
END $function$;

NOTIFY pgrst, 'reload schema';
