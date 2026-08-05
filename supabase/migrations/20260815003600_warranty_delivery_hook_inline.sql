-- ─────────────────────────────────────────────────────────────────────────────
-- Warranty Module — Phase 1, Task 6 (refactored)
--
-- Switch from the AFTER UPDATE trigger (added in 20260815003500) to an
-- inline call inside complete_delivery_inventory, per operator preference.
--
-- Steps:
--   1. Drop the trigger and its function (helper stays — it does the work).
--   2. Rewrite complete_delivery_inventory: identical body to the current
--      version (20260803001900_warehouse_model_v2_phase_d3_delivery_rpcs)
--      + one PERFORM call to create_warranty_records_for_delivery immediately
--      after UPDATE sale_deliveries SET status = 'delivered'.
--
-- Same-transaction guarantee is preserved: a raise inside the helper
-- rolls the whole RPC back.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Remove the trigger scaffolding ─────────────────────────────────────
DROP TRIGGER  IF EXISTS trg_sale_deliveries_create_warranties ON public.sale_deliveries;
DROP FUNCTION IF EXISTS public.sale_deliveries_create_warranties();

-- ── 2. Rewrite complete_delivery_inventory with inline warranty call ──────
CREATE OR REPLACE FUNCTION public.complete_delivery_inventory(
  p_delivery_id      uuid,
  p_so_id            uuid,
  p_sub_container_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_delivery         RECORD;
  v_line             RECORD;
  v_wh_id            UUID;
  v_date             DATE;
  v_layer            RECORD;
  v_all_delivered    BOOLEAN;
  v_any_delivered    BOOLEAN;
  v_division_id      UUID;
  v_sub_container_id UUID;
  v_check_wh         UUID;
  v_check_div        UUID;
  v_check_active     BOOLEAN;
BEGIN
  SELECT warehouse_id, date, status
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status <> 'pending' THEN
    RAISE EXCEPTION 'Delivery % already processed with status %', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  -- Resolve sub-container: explicit override (validated) or derive from SO.division_id
  SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id, sc.is_active
    INTO   v_check_wh, v_check_div, v_check_active
    FROM   public.warehouse_sub_containers sc
    WHERE  sc.id = p_sub_container_id;

    IF NOT FOUND OR v_check_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> v_wh_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, v_wh_id;
    END IF;
    IF v_division_id IS NOT NULL AND v_check_div IS DISTINCT FROM v_division_id THEN
      RAISE EXCEPTION 'Sub-container % is in a different division (%) than the SO (%)',
        p_sub_container_id, v_check_div, v_division_id;
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF v_division_id IS NULL THEN
    RAISE EXCEPTION 'SO % has no division set; pick a sub-container explicitly on the delivery form', p_so_id;
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
  END IF;

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  -- ── Warranty: create coverage records for every eligible line ──────────
  -- Same transaction. If this raises, the delivery flip is rolled back too.
  PERFORM public.create_warranty_records_for_delivery(p_delivery_id);

  FOR v_line IN
    SELECT brand_variant_id, item_name, sku, qty_delivered
    FROM sale_delivery_lines
    WHERE sale_delivery_id = p_delivery_id
  LOOP
    CONTINUE WHEN v_line.brand_variant_id IS NULL OR v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

    -- One COGS + one movement PER LAYER drained. Preserves per-receival
    -- cost detail on both ledgers (Scenario 2A).
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM deduct_fifo_layers(v_line.brand_variant_id, v_wh_id, v_line.qty_delivered, false, v_sub_container_id)
    LOOP
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id
      ) VALUES (
        v_line.brand_variant_id, p_delivery_id, p_so_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, v_date,
        'sale', v_layer.layer_id
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id
      ) VALUES (
        v_wh_id, v_sub_container_id, v_line.brand_variant_id,
        COALESCE(v_line.item_name, ''),
        v_line.sku,
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', p_delivery_id
      );
    END LOOP;

    -- Line-level bookkeeping (once per line, not per layer).
    UPDATE inventory_item_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_line.qty_delivered),
        updated_at   = now()
    WHERE id = v_line.brand_variant_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_line.qty_delivered
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_line.brand_variant_id;
  END LOOP;

  SELECT
    bool_and(COALESCE(delivered_qty, 0) >= qty),
    bool_or(COALESCE(delivered_qty, 0) > 0)
  INTO v_all_delivered, v_any_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_all_delivered THEN
    UPDATE sale_orders
    SET    status = 'delivered', updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('confirmed', 'partial_delivery');
  ELSIF v_any_delivered THEN
    UPDATE sale_orders
    SET    status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id
      AND  status = 'confirmed';
  END IF;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
