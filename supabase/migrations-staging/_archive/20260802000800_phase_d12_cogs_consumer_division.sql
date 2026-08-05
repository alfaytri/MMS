-- Phase D.12 Task 5 — COGS routing to the consumer division
--
-- When a division sells stock physically owned by another division (i.e.
-- Kitchen sells from a Maintenance sub-container the item was shared to),
-- the COGS entry must be attributed to the CONSUMER (Kitchen) for P&L, not
-- the physical owner (Maintenance). The physical location stays traceable
-- through the FIFO source chain (source_id → fifo_cost_layers.sub_container_id
-- → warehouse_sub_containers.division_id).
--
-- Historically `cogs_entries.division_id` was already stamped with the SO's
-- division_id via the `set_division_from_sale_order` trigger (added by the
-- multi-company isolation phase 2026-07-24), so consumer semantics are
-- already there implicitly. This migration promotes it to an explicit
-- `consumer_division_id` column for clarity and future-proofing, and
-- extends the delivery RPC to allow cross-division consumption when the
-- item has been shared to the SO's division.

BEGIN;

-- ─── 1. Schema — new explicit column ─────────────────────────────────────

ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS consumer_division_id uuid
  REFERENCES public.company_divisions(id);

CREATE INDEX IF NOT EXISTS idx_cogs_entries_consumer_division_id
  ON public.cogs_entries(consumer_division_id)
  WHERE consumer_division_id IS NOT NULL;

COMMENT ON COLUMN public.cogs_entries.consumer_division_id IS
'The division whose P&L bears this COGS entry — the SO owner, not the physical
stock owner. For same-division sales this equals the sub-container''s division;
for cross-division sales (Kitchen selling shared Maintenance stock) it equals
the SO''s division (Kitchen). Physical location remains derivable via
source_id → fifo_cost_layers.sub_container_id → warehouse_sub_containers.division_id.';

-- ─── 2. Backfill from existing division_id ───────────────────────────────
-- The legacy `division_id` column was already populated from sale_orders
-- via the set_division_from_sale_order trigger, so copying is safe. Rows
-- with no sale_order_id (landed-cost adjustments) get NULL — accepted.

UPDATE public.cogs_entries
   SET consumer_division_id = division_id
 WHERE consumer_division_id IS NULL
   AND division_id IS NOT NULL;

-- ─── 3. Auto-derive trigger — mirror the legacy division_id path ─────────

CREATE OR REPLACE FUNCTION public.set_consumer_division_from_sale_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.consumer_division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id
      INTO NEW.consumer_division_id
      FROM public.sale_orders
     WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cogs_entries_set_consumer_division
  ON public.cogs_entries;
CREATE TRIGGER trg_cogs_entries_set_consumer_division
  BEFORE INSERT ON public.cogs_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_consumer_division_from_sale_order();

-- ─── 4. Rewrite complete_delivery_inventory ──────────────────────────────
-- Changes from Phase D.3 (20260803001900):
--   (a) The same-division sub-container guard now allows cross-division
--       consumption when EVERY delivered line's item has the SO's division
--       in its `shared_with_division_ids`. If any line's item is not shared,
--       the RPC raises the same exception as before.
--   (b) COGS insert now stamps `consumer_division_id` explicitly to the SO's
--       division. The legacy `division_id` column keeps its trigger-derived
--       value (same source, same result) so existing reports continue to
--       work without change.

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
  v_unshared_count   INTEGER;
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

    -- Cross-division consumption is allowed IFF every delivered line's item
    -- has the SO's division in its shared_with_division_ids. Phase D.12 Task 5.
    IF v_division_id IS NOT NULL AND v_check_div IS DISTINCT FROM v_division_id THEN
      SELECT COUNT(*)::int
        INTO v_unshared_count
        FROM public.sale_delivery_lines sdl
        JOIN public.inventory_item_brand_variants ibv ON ibv.id = sdl.brand_variant_id
        JOIN public.inventory_items ii ON ii.id = ibv.item_id
       WHERE sdl.sale_delivery_id = p_delivery_id
         AND sdl.brand_variant_id IS NOT NULL
         AND COALESCE(sdl.qty_delivered, 0) > 0
         AND NOT (COALESCE(ii.shared_with_division_ids, ARRAY[]::uuid[]) @> ARRAY[v_division_id]);

      IF v_unshared_count > 0 THEN
        RAISE EXCEPTION 'Sub-container % is in division % but % delivered line(s) reference item(s) not shared to the SO''s division (%). Share the item(s) with the SO''s division or pick a sub-container in the SO''s division.',
          p_sub_container_id, v_check_div, v_unshared_count, v_division_id;
      END IF;
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
        qty, unit_cost, total_cost, date, source_type, source_id,
        consumer_division_id
      ) VALUES (
        v_line.brand_variant_id, p_delivery_id, p_so_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, v_date,
        'sale', v_layer.layer_id,
        v_division_id
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
