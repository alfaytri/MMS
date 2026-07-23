-- After completing a delivery, update the SO status to 'delivered' or 'partial_delivery'
-- based on whether all lines are fully delivered.
-- Also fix cancel_delivery_inventory to revert SO status accordingly.

CREATE OR REPLACE FUNCTION complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
  v_all_delivered BOOLEAN;
  v_any_delivered BOOLEAN;
BEGIN
  SELECT warehouse_id, date, items, status
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

  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty_delivered')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_wh_id, v_qty, false);

    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty - v_qty),
        updated_at   = now()
    WHERE id = v_bv_id;

    UPDATE sale_order_lines
    SET    delivered_qty = COALESCE(delivered_qty, 0) + v_qty
    WHERE  sale_order_id = p_so_id
      AND  brand_variant_id = v_bv_id;

    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date
    ) VALUES (
      v_bv_id, p_delivery_id, p_so_id,
      v_qty, v_result.weighted_unit_cost, v_result.total_cost, v_date
    );

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      'sale_delivery', -v_qty, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;

  -- Update SO status based on delivery progress
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
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;

-- Backfill SO statuses for existing data
WITH so_delivery_status AS (
  SELECT
    sol.sale_order_id,
    bool_and(COALESCE(sol.delivered_qty, 0) >= sol.qty) AS all_delivered,
    bool_or(COALESCE(sol.delivered_qty, 0) > 0) AS any_delivered
  FROM sale_order_lines sol
  JOIN sale_orders so ON so.id = sol.sale_order_id
  WHERE so.status IN ('confirmed', 'partial_delivery')
    AND so.deleted_at IS NULL
  GROUP BY sol.sale_order_id
)
UPDATE sale_orders so
SET    status = CASE
         WHEN sds.all_delivered THEN 'delivered'::sale_order_status
         WHEN sds.any_delivered THEN 'partial_delivery'::sale_order_status
         ELSE so.status
       END,
       updated_at = now()
FROM so_delivery_status sds
WHERE so.id = sds.sale_order_id
  AND (sds.all_delivered OR sds.any_delivered);
