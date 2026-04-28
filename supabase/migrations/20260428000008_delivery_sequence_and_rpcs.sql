-- supabase/migrations/20260428000008_delivery_sequence_and_rpcs.sql

BEGIN;

-- ─── Delivery number sequence ────────────────────────────────────────────────
-- Generates collision-free DEL-XXXXX numbers without client-side race conditions.
-- Initialized to max existing number so no IDs are reused.

CREATE SEQUENCE IF NOT EXISTS sale_delivery_number_seq START WITH 1;

SELECT setval(
  'sale_delivery_number_seq',
  GREATEST(1, COALESCE(
    (SELECT MAX(
       CASE WHEN delivery_number ~ '^DEL-[0-9]+$'
            THEN CAST(SUBSTRING(delivery_number FROM 5) AS INT)
            ELSE 0
       END
     ) FROM sale_deliveries),
    0
  ))
);

-- ─── create_and_confirm_delivery ─────────────────────────────────────────────
-- Inserts a new sale_delivery row and immediately confirms it in one transaction.
-- Returns the created delivery id and delivery_number.

CREATE OR REPLACE FUNCTION create_and_confirm_delivery(
  p_so_id          UUID,
  p_warehouse_id   UUID,
  p_warehouse_name TEXT,
  p_date           DATE,
  p_items          JSONB
)
RETURNS TABLE(id UUID, delivery_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
BEGIN
  v_delivery_number := 'DEL-' || LPAD(nextval('sale_delivery_number_seq')::TEXT, 5, '0');

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, items, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, p_items, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  -- Runs in the same transaction — fully atomic
  PERFORM complete_delivery_inventory(v_new_id, p_so_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_confirm_delivery(UUID, UUID, TEXT, DATE, JSONB) TO authenticated;

-- ─── cancel_delivery_inventory ───────────────────────────────────────────────
-- Cancels a delivery and reverses all inventory effects if it was delivered.

CREATE OR REPLACE FUNCTION cancel_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery  RECORD;
  v_cogs      RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_total_qty INT;
  v_delivered INT;
BEGIN
  SELECT warehouse_id, date, items, status
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

    -- ── Reverse delivered_qty on SO lines (match by bv_id, same as complete_delivery_inventory) ──
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
    LOOP
      v_bv_id := (v_item->>'brand_variant_id')::UUID;
      v_qty   := (v_item->>'qty_delivered')::INT;

      CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

      IF v_bv_id IS NOT NULL THEN
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  sale_order_id = p_so_id
          AND  brand_variant_id = v_bv_id;
      ELSE
        UPDATE sale_order_lines
        SET    delivered_qty = GREATEST(0, COALESCE(delivered_qty, 0) - v_qty)
        WHERE  id = (
          SELECT id FROM sale_order_lines
          WHERE  sale_order_id = p_so_id
            AND  item_name = (v_item->>'item_name')
          ORDER  BY id
          LIMIT  1
        );
      END IF;
    END LOOP;

    -- ── Restore FIFO layers from cogs_entries (one entry per item, weighted avg cost) ──
    FOR v_cogs IN
      SELECT brand_variant_id, qty, unit_cost
      FROM   cogs_entries
      WHERE  sale_delivery_id = p_delivery_id
    LOOP
      -- Restore FIFO layer using delivery date (preserves chronological queue order)
      -- total_unit_cost is per-unit in this schema (unit_cost + landed_cost_per_unit)
      -- landed_cost_per_unit = 0: cogs_entries.unit_cost is already the blended weighted cost
      -- (unit_cost + original landed cost), so total_unit_cost is correct for FIFO deductions.
      -- Audit queries reading landed_cost_per_unit directly will see 0 on restored layers.
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_cogs.brand_variant_id, v_wh_id, COALESCE(v_delivery.date, CURRENT_DATE),
        v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty
      );

      UPDATE inventory_brand_variants
      SET    stock_level = stock_level + v_cogs.qty,
             updated_at  = now()
      WHERE  id = v_cogs.brand_variant_id;

      PERFORM recalc_average_cost(v_cogs.brand_variant_id);

      -- Delete outbound stock movement for this item
      DELETE FROM inventory_stock_movements
      WHERE  reference_type   = 'sale_delivery'
        AND  reference_id     = p_delivery_id
        AND  brand_variant_id = v_cogs.brand_variant_id;
    END LOOP;

    -- Delete all COGS entries for this delivery
    DELETE FROM cogs_entries
    WHERE  sale_delivery_id = p_delivery_id;

    -- ── Recalculate SO status ────────────────────────────────────────────────
    SELECT COALESCE(SUM(qty), 0), COALESCE(SUM(delivered_qty), 0)
    INTO   v_total_qty, v_delivered
    FROM   sale_order_lines
    WHERE  sale_order_id = p_so_id;

    IF v_delivered >= v_total_qty AND v_total_qty > 0 THEN
      UPDATE sale_orders
      SET    status = 'delivered', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    -- 'delivered' is intentionally absent from the exclusion list here: cancelling one delivery
    -- on a fully-delivered SO should demote it back to partial_delivery. This differs from
    -- complete_delivery_inventory which guards against 'delivered' to prevent re-delivering.
    ELSIF v_delivered > 0 THEN
      UPDATE sale_orders
      SET    status = 'partial_delivery', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    ELSE
      UPDATE sale_orders
      SET    status = 'confirmed', updated_at = now()
      WHERE  id = p_so_id
        AND  status NOT IN ('cancelled', 'invoiced', 'closed');
    END IF;

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_inventory(UUID, UUID) TO authenticated;

COMMIT;
