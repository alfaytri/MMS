-- Teams + Places + Consumption — Task 4 of 4 DB migrations
--
-- Two RPCs power the Consumption Page:
--
--   rpc_post_consumption   — validates the input, inserts a
--                            consumption_entries row (status='posted'),
--                            drains FIFO layers at the source sub-container
--                            for each line, and writes per-layer COGS +
--                            movement rows. Attributes COGS to the picked
--                            consumer (team / customer_site / customer /
--                            internal).
--
--   rpc_cancel_consumption — reverses everything. Reads the linked COGS
--                            rows, restores each drained layer to its
--                            original sub-container, deletes the COGS +
--                            movement rows, flips status to 'cancelled'.
--
-- Modeled after complete_delivery_inventory + cancel_delivery_inventory
-- (Phase D.12 / D.3). No new machinery.
--
-- Plan: docs/plans/2026-08-03-teams-places-consumption.md (Task 4 of 4).
-- Prior migration: 20260815000300_teams_places_consumption_tables.sql

-- 1. rpc_post_consumption ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_post_consumption(
  p_source_warehouse_id      uuid,
  p_source_sub_container_id  uuid,
  p_consumer_type            text,
  p_consumer_team_sub_id     uuid,
  p_consumer_place_sub_id    uuid,
  p_consumer_customer_id     uuid,
  p_notes                    text,
  p_attachments              text[],
  p_lines                    jsonb   -- [{brand_variant_id, qty}, ...]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_consumption_id       uuid;
  v_ce_number            text;
  v_sub                  RECORD;
  v_line                 jsonb;
  v_variant_id           uuid;
  v_qty                  int;
  v_label                RECORD;
  v_layer                RECORD;
  v_qty_taken_sum        int;
  v_total_cost_sum       numeric;
  v_weighted_unit_cost   numeric;
  v_uid                  uuid := public._current_user_data_id();
  v_touched_variants     uuid[] := '{}';
  v_variant              uuid;
BEGIN
  -- ── 1. Input validation ────────────────────────────────────────
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_post_consumption: at least one line is required';
  END IF;

  IF p_consumer_type NOT IN ('team','customer_site','customer','internal') THEN
    RAISE EXCEPTION 'rpc_post_consumption: invalid consumer_type % (expected team|customer_site|customer|internal)', p_consumer_type;
  END IF;

  -- Exactly one consumer FK matches consumer_type (except 'internal' which has none).
  IF p_consumer_type = 'team'          AND p_consumer_team_sub_id  IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=team requires consumer_team_sub_id';
  END IF;
  IF p_consumer_type = 'customer_site' AND p_consumer_place_sub_id IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=customer_site requires consumer_place_sub_id';
  END IF;
  IF p_consumer_type = 'customer'      AND p_consumer_customer_id  IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=customer requires consumer_customer_id';
  END IF;

  -- Only the matching consumer FK is honoured — clear the others.
  IF p_consumer_type <> 'team'          THEN p_consumer_team_sub_id  := NULL; END IF;
  IF p_consumer_type <> 'customer_site' THEN p_consumer_place_sub_id := NULL; END IF;
  IF p_consumer_type <> 'customer'      THEN p_consumer_customer_id  := NULL; END IF;

  -- Source sub-container must belong to the source warehouse + be active.
  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active
    INTO v_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % not found or inactive', p_source_sub_container_id;
  END IF;
  IF v_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % does not belong to warehouse %', p_source_sub_container_id, p_source_warehouse_id;
  END IF;

  -- ── 2. Header insert (status='posted') ─────────────────────────
  v_ce_number := public.generate_consumption_number();

  INSERT INTO public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id
  ) VALUES (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
    NULLIF(p_notes, ''), COALESCE(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id
  )
  RETURNING id INTO v_consumption_id;

  -- ── 3. Line loop ───────────────────────────────────────────────
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_variant_id := (v_line->>'brand_variant_id')::uuid;
    v_qty        := (v_line->>'qty')::int;

    IF v_variant_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'rpc_post_consumption: invalid line %', v_line;
    END IF;

    -- Human-readable labels for consumption_lines
    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           COALESCE(ii.sku, '')::text     AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_variant_id;

    v_qty_taken_sum := 0;
    v_total_cost_sum := 0;

    -- Per-layer drain: preserves per-receival cost detail on COGS + movements.
    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_variant_id,
        p_source_warehouse_id,
        v_qty,
        false,                          -- p_is_transfer
        p_source_sub_container_id       -- p_sub_container_id filter
      )
    LOOP
      v_qty_taken_sum  := v_qty_taken_sum  + v_layer.qty_taken;
      v_total_cost_sum := v_total_cost_sum + v_layer.total_cost;

      INSERT INTO public.cogs_entries (
        brand_variant_id, qty, unit_cost, total_cost, date,
        source_type, source_id,
        consumption_id, consumer_type,
        consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
        division_id, consumer_division_id
      ) VALUES (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
        v_sub.division_id, v_sub.division_id     -- consumer_division_id matches source for now
      );

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        p_source_warehouse_id, p_source_sub_container_id, v_variant_id,
        v_label.item_name, NULLIF(v_label.sku, ''),
        'consumption', -v_layer.qty_taken, v_layer.unit_cost,
        'consumption', v_consumption_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'rpc_post_consumption: insufficient stock for variant % at sub % (requested %, drained %)',
        v_variant_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
    END IF;

    -- Weighted unit cost across drained layers.
    v_weighted_unit_cost := v_total_cost_sum / v_qty_taken_sum;

    INSERT INTO public.consumption_lines (
      consumption_id, brand_variant_id, item_name, sku, qty, unit_cost
    ) VALUES (
      v_consumption_id, v_variant_id, v_label.item_name, NULLIF(v_label.sku, ''), v_qty, v_weighted_unit_cost
    );

    v_touched_variants := v_touched_variants || v_variant_id;
  END LOOP;

  -- ── 4. Recompute weighted average cost per touched variant ─────
  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  RETURN v_consumption_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_post_consumption(uuid, uuid, text, uuid, uuid, uuid, text, text[], jsonb) IS
'Posts a consumption. Drains FIFO layers at (source_warehouse, source_sub_container)
for each p_lines entry, writes per-layer cogs_entries + inventory_stock_movements
attributed to the consumer, and returns the new consumption_entries.id. Raises
on invalid consumer shape, wrong sub-container, or insufficient stock.';

-- 2. rpc_cancel_consumption ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cancel_consumption(
  p_consumption_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ce                RECORD;
  v_cogs              RECORD;
  v_sub_container_id  uuid;
  v_uid               uuid := public._current_user_data_id();
  v_touched_variants  uuid[] := '{}';
  v_variant           uuid;
BEGIN
  SELECT id, status, source_warehouse_id, source_sub_container_id, ce_number, division_id
    INTO v_ce
    FROM public.consumption_entries
    WHERE id = p_consumption_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % not found', p_consumption_id;
  END IF;
  IF v_ce.status <> 'posted' THEN
    RAISE EXCEPTION 'rpc_cancel_consumption: consumption % is % (expected posted)', p_consumption_id, v_ce.status;
  END IF;

  -- Restore each drained layer to its original sub-container. When the
  -- original layer is still present, we insert a compensating layer at
  -- the same unit_cost + sub_container (mirrors cancel_delivery_inventory).
  FOR v_cogs IN
    SELECT brand_variant_id, qty, unit_cost, source_id
    FROM   public.cogs_entries
    WHERE  consumption_id = p_consumption_id
  LOOP
    v_sub_container_id := NULL;
    IF v_cogs.source_id IS NOT NULL THEN
      SELECT sub_container_id INTO v_sub_container_id
      FROM   public.fifo_cost_layers
      WHERE  id = v_cogs.source_id;
    END IF;

    -- Fallback: original layer purged. Land the restore on the consumption's
    -- own source sub-container (best available guess).
    IF v_sub_container_id IS NULL THEN
      v_sub_container_id := v_ce.source_sub_container_id;
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id
    ) VALUES (
      v_cogs.brand_variant_id, v_ce.source_warehouse_id, v_sub_container_id, current_date,
      v_cogs.qty, v_cogs.unit_cost, 0, v_cogs.unit_cost, v_cogs.qty,
      'consumption_cancel', p_consumption_id
    );

    v_touched_variants := v_touched_variants || v_cogs.brand_variant_id;
  END LOOP;

  DELETE FROM public.inventory_stock_movements
   WHERE reference_type = 'consumption'
     AND reference_id   = p_consumption_id;

  DELETE FROM public.cogs_entries
   WHERE consumption_id = p_consumption_id;

  -- Recompute weighted average cost per touched variant.
  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  UPDATE public.consumption_entries
     SET status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now()
   WHERE id = p_consumption_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_cancel_consumption(uuid) IS
'Reverses a posted consumption: restores each drained FIFO layer to its
original sub-container, deletes the linked cogs_entries + movements, flips
status to cancelled. If the original fifo_cost_layer is gone, the restore
lands on the consumption''s source sub-container as a best-effort fallback.';
