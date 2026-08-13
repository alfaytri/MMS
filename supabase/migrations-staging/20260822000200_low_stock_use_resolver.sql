-- Phase 2: low_stock_alert recipients via the shared resolver
-- (warehouse.stock.view holders who are RPs of the affected warehouse), replacing
-- the raw all-RPs loop. Verbatim from the live function; ONLY the loop's recipient
-- SELECT changed. The message text (incl. the em-dash) is preserved byte-for-byte.

CREATE OR REPLACE FUNCTION public.check_low_stock_and_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_qty INT;
  v_reorder RECORD;
  v_old_qty INT;
  v_other_wh RECORD;
  v_field_rp RECORD;
  v_item_label TEXT;
  v_wh_name TEXT;
BEGIN
  IF NEW.qty >= 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(remaining_qty), 0)::INT INTO v_new_qty
  FROM public.fifo_cost_layers
  WHERE brand_variant_id = NEW.brand_variant_id
    AND warehouse_id     = NEW.warehouse_id
    AND remaining_qty > 0;

  SELECT * INTO v_reorder
  FROM public.warehouse_reorder_points
  WHERE warehouse_id     = NEW.warehouse_id
    AND brand_variant_id = NEW.brand_variant_id;

  IF NOT FOUND OR v_reorder.reorder_point <= 0 THEN RETURN NEW; END IF;

  v_old_qty := v_new_qty - NEW.qty;

  IF NOT (v_old_qty > v_reorder.reorder_point AND v_new_qty <= v_reorder.reorder_point) THEN
    RETURN NEW;
  END IF;

  IF v_reorder.last_notified_at IS NOT NULL
     AND v_reorder.last_notified_at > now() - INTERVAL '24 hours' THEN
    RETURN NEW;
  END IF;

  SELECT f.warehouse_id, w.name, COALESCE(SUM(f.remaining_qty), 0)::INT AS qty
  INTO v_other_wh
  FROM public.fifo_cost_layers f
  JOIN public.warehouses w ON w.id = f.warehouse_id
  WHERE f.brand_variant_id = NEW.brand_variant_id
    AND f.warehouse_id    != NEW.warehouse_id
    AND f.remaining_qty > 0
  GROUP BY f.warehouse_id, w.name
  ORDER BY SUM(f.remaining_qty) DESC
  LIMIT 1;

  IF NOT FOUND OR v_other_wh.qty <= 0 THEN RETURN NEW; END IF;

  SELECT name INTO v_wh_name FROM public.warehouses WHERE id = NEW.warehouse_id;
  v_item_label := NEW.item_name;

  FOR v_field_rp IN
    SELECT rid AS profile_id
    FROM public.recipients_for_permission('warehouse.stock.view', NEW.warehouse_id) AS rid
  LOOP
    INSERT INTO public.notifications (profile_id, type, title, body, related_type)
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

  UPDATE public.warehouse_reorder_points
  SET last_notified_at = now()
  WHERE id = v_reorder.id;

  RETURN NEW;
END;
$function$

