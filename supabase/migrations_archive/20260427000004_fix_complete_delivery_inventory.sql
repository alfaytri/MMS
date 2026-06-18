-- supabase/migrations/20260427000004_fix_complete_delivery_inventory.sql
-- Fixes:
--   1. Remove 'draft' from status guard (not a valid sale_delivery_status enum value)
--   2. Update sale_order_lines.delivered_qty after delivery completion
--   3. Update sale_order status → partial_delivery or delivered accordingly

BEGIN;

CREATE OR REPLACE FUNCTION complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery    RECORD;
  v_item        JSONB;
  v_bv_id       UUID;
  v_qty         INT;
  v_wh_id       UUID;
  v_date        DATE;
  v_result      RECORD;
  v_total_qty   INT;
  v_delivered   INT;
BEGIN
  SELECT warehouse_id, date, items, status
  INTO   v_delivery
  FROM   sale_deliveries
  WHERE  id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  IF v_delivery.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Delivery % already processed (status: %)', p_delivery_id, v_delivery.status;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  -- Mark delivery as delivered
  UPDATE sale_deliveries
  SET    status = 'delivered', updated_at = now()
  WHERE  id = p_delivery_id;

  -- Process each line item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty_delivered')::INT;

    CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

    -- Update delivered_qty on the sale_order_line (match by brand_variant_id + sale_order_id)
    IF v_bv_id IS NOT NULL THEN
      UPDATE sale_order_lines
      SET    delivered_qty = COALESCE(delivered_qty, 0) + v_qty
      WHERE  sale_order_id = p_so_id
        AND  brand_variant_id = v_bv_id;
    ELSE
      -- Fallback: match by item_name for non-inventory lines (first match only)
      UPDATE sale_order_lines
      SET    delivered_qty = COALESCE(delivered_qty, 0) + v_qty
      WHERE  id = (
        SELECT id FROM sale_order_lines
        WHERE  sale_order_id = p_so_id
          AND  item_name = (v_item->>'item_name')
        ORDER  BY id
        LIMIT  1
      );
    END IF;

    CONTINUE WHEN v_bv_id IS NULL;

    -- FIFO deduction (skip gracefully if no stock layers — non-inventory items)
    BEGIN
      SELECT total_cost, weighted_unit_cost
      INTO   v_result
      FROM   deduct_fifo_layers(v_bv_id, v_wh_id, v_qty, false);

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
    EXCEPTION WHEN OTHERS THEN
      -- Stock deduction failed (e.g. insufficient layers) — log and continue
      RAISE WARNING 'FIFO deduction failed for bv_id=% qty=%: %', v_bv_id, v_qty, SQLERRM;
    END;
  END LOOP;

  -- Update SO status based on delivery completion
  SELECT
    COALESCE(SUM(qty), 0),
    COALESCE(SUM(delivered_qty), 0)
  INTO v_total_qty, v_delivered
  FROM sale_order_lines
  WHERE sale_order_id = p_so_id;

  IF v_delivered >= v_total_qty AND v_total_qty > 0 THEN
    UPDATE sale_orders SET status = 'delivered', updated_at = now()
    WHERE  id = p_so_id AND status NOT IN ('cancelled', 'invoiced', 'closed');
  ELSIF v_delivered > 0 THEN
    UPDATE sale_orders SET status = 'partial_delivery', updated_at = now()
    WHERE  id = p_so_id AND status NOT IN ('cancelled', 'invoiced', 'closed', 'delivered');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;

COMMIT;
