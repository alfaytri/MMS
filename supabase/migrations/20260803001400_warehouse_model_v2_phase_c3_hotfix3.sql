-- =============================================================================
-- Warehouse Model v2 — Phase C.3 hotfix #3
--
-- The 2026-07-24 rename migration (20260724010000) renamed the table
-- `warehouse_field_rps` → `warehouse_responsible_persons` and renamed any
-- FUNCTION that had the old name in its identifier, but did NOT rewrite the
-- BODIES of functions that referenced the old table name. Three such
-- functions survived on staging. Two of them fire from Phase D.1 flows:
--
--   * `replace_warehouse_responsible_persons(uuid, uuid[])` — SECURITY
--     DEFINER RPC called by useReplaceWarehouseResponsiblePersons. Blocks
--     every warehouse create/edit through the master-data form.
--   * `check_low_stock_and_notify()` — trigger on inventory_stock_movements.
--     Would blow up the next low-stock movement, unrelated to D.1 but still
--     wrong.
--   * `is_field_rp_of(uuid, uuid)` — helper still callable from anywhere.
--
-- Live bodies fetched via pg_proc.prosrc and re-issued verbatim with only
-- the table-name reference updated. Per feedback_rewrite_functions_from_live_db.
-- =============================================================================

-- ── 1. replace_warehouse_responsible_persons ────────────────────────────
CREATE OR REPLACE FUNCTION public.replace_warehouse_responsible_persons(
  p_warehouse_id uuid,
  p_profile_ids  uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.warehouse_responsible_persons WHERE warehouse_id = p_warehouse_id;
  IF p_profile_ids IS NOT NULL AND array_length(p_profile_ids, 1) IS NOT NULL THEN
    INSERT INTO public.warehouse_responsible_persons (warehouse_id, profile_id)
    SELECT p_warehouse_id, unnest(p_profile_ids);
  END IF;
END;
$$;

-- ── 2. is_field_rp_of ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_field_rp_of(
  p_profile_id   uuid,
  p_warehouse_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.warehouse_responsible_persons wrp
    WHERE  wrp.profile_id   = p_profile_id
      AND  wrp.warehouse_id = p_warehouse_id
  );
$$;

-- ── 3. check_low_stock_and_notify ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_low_stock_and_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
    SELECT wrp.profile_id
    FROM public.warehouse_responsible_persons wrp
    WHERE wrp.warehouse_id = NEW.warehouse_id
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
$$;
