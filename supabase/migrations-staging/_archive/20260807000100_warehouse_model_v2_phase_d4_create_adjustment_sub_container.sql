-- Warehouse Model v2 — Phase D.4 Task 4
-- `create_stock_adjustment_v2` accepts + stamps `p_sub_container_id`.
--
-- Live body sourced 2026-08-01 via pg_get_functiondef; the only deltas over
-- that body are the new optional `p_sub_container_id` parameter, its
-- validation block, and the added `sub_container_id` column on the
-- stock_adjustments INSERT. All existing behaviour (adjustment-type guard,
-- qty guard, conditional workflow steps, "no steps configured" hard-fail)
-- is preserved verbatim.
--
-- Because the new parameter has a DEFAULT, we MUST drop the old 9-arg
-- overload first — otherwise Postgres keeps both signatures live and every
-- 9-arg caller becomes ambiguous.

DROP FUNCTION IF EXISTS public.create_stock_adjustment_v2(
  uuid, uuid, text, numeric, text, text, text[], uuid, text
);

CREATE OR REPLACE FUNCTION public.create_stock_adjustment_v2(
  p_warehouse_id      uuid,
  p_brand_variant_id  uuid,
  p_adjustment_type   text,
  p_qty               numeric,
  p_reason            text,
  p_notes             text,
  p_photo_urls        text[],
  p_requested_by      uuid,
  p_requested_by_name text,
  p_sub_container_id  uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id             uuid;
  v_step           RECORD;
  v_ord            int := 0;
  v_sub_container  uuid;
  v_wh_division    uuid;
  v_check_wh       uuid;
  v_check_active   boolean;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  -- Resolve sub-container: explicit pick > (warehouse × division) derive.
  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.is_active
      INTO v_check_wh, v_check_active
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id = p_sub_container_id;

    IF NOT FOUND OR v_check_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> p_warehouse_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %',
        p_sub_container_id, p_warehouse_id;
    END IF;
    v_sub_container := p_sub_container_id;
  ELSE
    SELECT division_id INTO v_wh_division
    FROM   public.warehouses
    WHERE  id = p_warehouse_id;

    IF v_wh_division IS NULL THEN
      RAISE EXCEPTION 'Warehouse % has no division set and no sub-container was picked. Adjustments require an explicit sub-container on multi-division warehouses.',
        p_warehouse_id
        USING HINT = 'Open the adjustment dialog and pick a sub-container from the picker.';
    END IF;

    v_sub_container := public._find_or_create_sub_container(p_warehouse_id, v_wh_division);
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name
  ) VALUES (
    p_warehouse_id,
    v_sub_container,
    p_brand_variant_id,
    p_adjustment_type::public.stock_adjustment_type,
    p_qty,
    p_reason,
    NULLIF(p_notes,''),
    COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by,
    p_requested_by_name
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$;
