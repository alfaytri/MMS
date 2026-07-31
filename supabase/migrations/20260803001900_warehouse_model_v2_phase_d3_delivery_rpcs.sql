-- Warehouse Model v2 — Phase D.3
-- Delivery RPCs now scope FIFO drains / restores to a sub-container.
--   complete_delivery_inventory: derives from (warehouse × SO.division) or accepts explicit p_sub_container_id
--   cancel_delivery_inventory:   restores each layer to the sub-container the original layer came from
--                                (via cogs_entries.source_id → fifo_cost_layers lookup)

-- Schema tweak: cogs_entries carries source_id (FK to the FIFO layer it drained).
-- Nullable to preserve historical rows. New writes always stamp it.
ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.fifo_cost_layers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cogs_entries_source_id_idx
  ON public.cogs_entries(source_id);

-- Drop legacy 2-arg overload of complete_delivery_inventory
DROP FUNCTION IF EXISTS public.complete_delivery_inventory(uuid, uuid);

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


CREATE OR REPLACE FUNCTION public.cancel_delivery_inventory(
  p_delivery_id uuid,
  p_so_id       uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_delivery          RECORD;
  v_cogs              RECORD;
  v_line              RECORD;
  v_wh_id             UUID;
  v_division_id       UUID;
  v_sub_container_id  UUID;
BEGIN
  SELECT warehouse_id, date, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery % is already cancelled', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;

  UPDATE sale_deliveries
  SET    status = 'cancelled', updated_at = now()
  WHERE  id = p_delivery_id;

  IF v_delivery.status = 'delivered' THEN

    SELECT division_id INTO v_division_id FROM sale_orders WHERE id = p_so_id;

    -- Reverse delivered_qty on SO lines
    FOR v_line IN
      SELECT brand_variant_id, item_name, qty_delivered
      FROM sale_delivery_lines
      WHERE sale_delivery_id = p_delivery_id
    LOOP
      CONTINUE WHEN v_line.qty_delivered IS NULL OR v_line.qty_delivered <= 0;

      IF v_line.brand_variant_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_line.brand_variant_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_line.qty_delivered)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = v_line.item_name
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- Restore FIFO layers from cogs_entries, per-layer sub_container_id
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost, source_id
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      -- Restore to the SAME sub-container the drained layer came from
      v_sub_container_id := NULL;
      IF v_cogs.source_id IS NOT NULL THEN
        SELECT sub_container_id INTO v_sub_container_id
        FROM   public.fifo_cost_layers
        WHERE  id = v_cogs.source_id;
      END IF;

      -- Fallback if the original layer was purged (rare): re-derive
      IF v_sub_container_id IS NULL AND v_division_id IS NOT NULL THEN
        v_sub_container_id := public._find_or_create_sub_container(v_wh_id, v_division_id);
      END IF;

      IF v_sub_container_id IS NULL THEN
        RAISE EXCEPTION 'Cannot restore FIFO layer for variant %: no sub-container resolvable (original layer purged and SO has no division)', v_cogs.brand_variant_id;
      END IF;

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, sub_container_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, v_sub_container_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_item_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    DELETE FROM cogs_entries WHERE sale_delivery_id = p_delivery_id;

    -- Revert SO status
    UPDATE sale_orders
    SET    status = CASE
             WHEN EXISTS (
               SELECT 1 FROM sale_order_lines
               WHERE sale_order_id = p_so_id AND COALESCE(delivered_qty, 0) > 0
             ) THEN 'partial_delivery'::sale_order_status
             ELSE 'confirmed'::sale_order_status
           END,
           updated_at = now()
    WHERE  id = p_so_id
      AND  status IN ('delivered', 'partial_delivery');
  END IF;
END;
$function$;
