-- Warehouse Model v2 — Phase F, migration 2/3
--
-- `rpc_request_damaged_writeoff` — mirror of `create_stock_adjustment_v2`
-- for the damaged pile. Creates a stock_adjustments row with
-- adjustment_type='write_off', source_pile='damaged', status='pending_approval',
-- and builds the same 'stock_adj' approval chain the existing SA flow uses.
--
-- Guards:
--   * Damaged pile must have >= p_qty at (warehouse, brand_variant) — no
--     point queueing an approval you can't fulfil.
--   * Sub-container must belong to the warehouse and be active (Phase E rule).
--     For damaged writeoffs the sub-container is bookkeeping only — the
--     actual damaged pile is per (warehouse, variant), not per sub.
--   * qty > 0.
--
-- Returns the new stock_adjustments.id so the caller can navigate to the
-- approval detail.

CREATE OR REPLACE FUNCTION public.rpc_request_damaged_writeoff(
  p_warehouse_id      uuid,
  p_brand_variant_id  uuid,
  p_qty               int,
  p_sub_container_id  uuid,
  p_reason            text,
  p_notes             text,
  p_requested_by      uuid,
  p_requested_by_name text
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available   numeric;
  v_check_wh    uuid;
  v_check_active boolean;
  v_id          uuid;
  v_step        RECORD;
  v_ord         int := 0;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: qty must be > 0 (got %)', p_qty;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: reason is required';
  END IF;

  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub_container_id is required — pick one on the dialog.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  SELECT COALESCE(qty, 0)
    INTO v_available
    FROM public.inventory_damaged_stock
    WHERE warehouse_id     = p_warehouse_id
      AND brand_variant_id = p_brand_variant_id;

  IF COALESCE(v_available, 0) < p_qty THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, COALESCE(v_available, 0), p_qty;
  END IF;

  INSERT INTO public.stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id,
    adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name,
    source_pile
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    'write_off'::public.stock_adjustment_type, p_qty,
    p_reason, NULLIF(p_notes, ''), '{}'::text[], 'pending_approval',
    p_requested_by, p_requested_by_name,
    'damaged'
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   public.approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER  BY step_order
  LOOP
    IF v_step.is_conditional AND NOT ('write_off' = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO public.stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'rpc_request_damaged_writeoff: no approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_request_damaged_writeoff(uuid, uuid, int, uuid, text, text, uuid, text) IS
'Warehouse Model v2 Phase F. Queues a damaged-pile writeoff for approval.
Creates a stock_adjustments row with source_pile=''damaged'' + adjustment_type=''write_off''
and builds the standard ''stock_adj'' approval chain. On approve, the Phase F
approver RPC consumes from inventory_damaged_stock and logs a
damaged_write_off movement.';
