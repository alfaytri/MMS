-- Fix: complete_delivery_inventory must increment delivered_qty on
-- sale_order_lines so the delivery progress column is accurate.
-- The cancel function already decrements it; this was the missing counterpart.

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

    -- Increment delivered_qty on the matching SO line
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
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;

-- Backfill delivered_qty for existing delivered deliveries
WITH delivered_items AS (
  SELECT
    sd.sale_order_id,
    (item->>'brand_variant_id')::UUID AS brand_variant_id,
    SUM((item->>'qty_delivered')::INT) AS total_delivered
  FROM sale_deliveries sd,
       jsonb_array_elements(sd.items) AS item
  WHERE sd.status = 'delivered'
    AND (item->>'brand_variant_id') IS NOT NULL
    AND (item->>'qty_delivered')::INT > 0
  GROUP BY sd.sale_order_id, (item->>'brand_variant_id')::UUID
)
UPDATE sale_order_lines sol
SET delivered_qty = di.total_delivered
FROM delivered_items di
WHERE sol.sale_order_id = di.sale_order_id
  AND sol.brand_variant_id = di.brand_variant_id;
