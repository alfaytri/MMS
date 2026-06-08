-- supabase/migrations/20260608000007_low_stock_trigger.sql
BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- Function: check_low_stock_and_notify
-- Called after stock-reducing movements to check threshold crossing.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_low_stock_and_notify()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_qty INT;
  v_reorder RECORD;
  v_old_qty INT;
  v_other_wh RECORD;
  v_field_rp RECORD;
  v_item_label TEXT;
  v_wh_name TEXT;
BEGIN
  -- Only fire on stock-reducing movements (negative qty)
  IF NEW.qty >= 0 THEN RETURN NEW; END IF;

  -- Get current stock qty in this warehouse for this item
  SELECT COALESCE(SUM(remaining_qty), 0)::INT INTO v_new_qty
  FROM fifo_cost_layers
  WHERE brand_variant_id = NEW.brand_variant_id
    AND warehouse_id = NEW.warehouse_id
    AND remaining_qty > 0;

  -- Check if a reorder point is configured
  SELECT * INTO v_reorder
  FROM warehouse_reorder_points
  WHERE warehouse_id = NEW.warehouse_id
    AND brand_variant_id = NEW.brand_variant_id;

  -- No reorder point configured → skip
  IF NOT FOUND OR v_reorder.reorder_point <= 0 THEN RETURN NEW; END IF;

  -- Compute previous qty (before this movement)
  v_old_qty := v_new_qty - NEW.qty; -- qty is negative, so subtracting adds

  -- Threshold crossing check: was above, now at or below
  IF NOT (v_old_qty > v_reorder.reorder_point AND v_new_qty <= v_reorder.reorder_point) THEN
    RETURN NEW;
  END IF;

  -- 24-hour cooldown
  IF v_reorder.last_notified_at IS NOT NULL
     AND v_reorder.last_notified_at > now() - INTERVAL '24 hours' THEN
    RETURN NEW;
  END IF;

  -- Find another warehouse with stock for this item
  SELECT f.warehouse_id, w.name, COALESCE(SUM(f.remaining_qty), 0)::INT AS qty
  INTO v_other_wh
  FROM fifo_cost_layers f
  JOIN warehouses w ON w.id = f.warehouse_id
  WHERE f.brand_variant_id = NEW.brand_variant_id
    AND f.warehouse_id != NEW.warehouse_id
    AND f.remaining_qty > 0
  GROUP BY f.warehouse_id, w.name
  ORDER BY SUM(f.remaining_qty) DESC
  LIMIT 1;

  -- No other warehouse has stock → skip notification
  IF NOT FOUND OR v_other_wh.qty <= 0 THEN RETURN NEW; END IF;

  -- Get warehouse name and item label
  SELECT name INTO v_wh_name FROM warehouses WHERE id = NEW.warehouse_id;
  v_item_label := NEW.item_name;

  -- Notify all Field RPs of this warehouse
  FOR v_field_rp IN
    SELECT wfr.profile_id
    FROM warehouse_field_rps wfr
    WHERE wfr.warehouse_id = NEW.warehouse_id
  LOOP
    INSERT INTO notifications (profile_id, type, title, body, related_type)
    VALUES (
      v_field_rp.profile_id,
      'low_stock_alert',
      'Low Stock Alert',
      'Low Stock Alert — ' || v_item_label || ' is at ' || v_new_qty || ' units in '
        || COALESCE(v_wh_name, 'warehouse') || ' (reorder point: ' || v_reorder.reorder_point
        || '). ' || v_other_wh.name || ' has ' || v_other_wh.qty
        || ' units available. Consider requesting a transfer.',
      'warehouse_stock'
    );
  END LOOP;

  -- Update cooldown
  UPDATE warehouse_reorder_points
  SET last_notified_at = now()
  WHERE id = v_reorder.id;

  RETURN NEW;
END;
$$;

-- ── Attach trigger to stock movements table ────────────────────────────
DROP TRIGGER IF EXISTS trg_low_stock_notify ON inventory_stock_movements;

CREATE TRIGGER trg_low_stock_notify
  AFTER INSERT ON inventory_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION check_low_stock_and_notify();

COMMIT;
