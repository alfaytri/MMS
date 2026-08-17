-- Free PO-receival items enter stock (as zero-cost FIFO layers), and the
-- moving-average cost ignores free/zero-cost layers.
--
-- BEFORE: create_and_approve_receival recorded a free line in receival_items
-- then `CONTINUE WHEN is_free = TRUE` — so free items never got a FIFO layer,
-- a stock bump, or a movement. They showed under "Received Items" but never
-- entered inventory. (The 'free_receival' movement type + UI label already
-- existed, unused.)
--
-- AFTER: a free item creates a ZERO-cost FIFO layer (unit_cost 0), bumps
-- stock_level, and writes a 'free_receival' movement — so the qty is on hand
-- but adds 0 value and is consumed later at 0 COGS. Free units do NOT count
-- toward the PO line's received_qty (they are a bonus, not ordered fulfilment).
--
-- Average cost: recalc_average_cost already excludes zero-cost layers
-- (`total_unit_cost > 0`). warehouse_stock_summary's avg_cost did NOT — it
-- averaged over every remaining layer, so a free layer would dilute the
-- displayed unit cost (e.g. 30,500/102 = 299.02 instead of 305). Both
-- refresh_stock_summary_row and refresh_all_stock_summaries now exclude
-- zero-cost layers from the avg divisor ONLY: qty and total_value still count
-- the free units (free = +qty, +0 value), the unit cost stays paid-only.
--
-- Bodies are the live pg_get_functiondef definitions; only the free-item
-- handling (RPC) and the avg-cost divisor (both refreshers) change.

-- ── 1. PO receival: free items enter stock as zero-cost layers ──────────────
CREATE OR REPLACE FUNCTION public.create_and_approve_receival(p_po_id uuid, p_warehouse_id uuid, p_date date, p_received_by_name text, p_receival_number text, p_notes text, p_items jsonb, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receival_id       UUID;
  v_receival_number   TEXT;
  v_item              JSONB;
  v_bv_id             UUID;
  v_bv_ids            UUID[] := '{}';
  v_bv_id_elem        UUID;
  v_qty               INT;
  v_cost              NUMERIC;
  v_cost_qar          NUMERIC;
  v_is_free           BOOLEAN;
  v_pli_id            UUID;
  v_po_currency       TEXT;
  v_po_rate           NUMERIC;
  v_division_id       UUID;
  v_division_ids      UUID[];
  v_allowed_divs      UUID[];
  v_sub_container_id  UUID;
  v_check_wh          UUID;
  v_check_div         UUID;
BEGIN
  IF NOT public._auth_user_has_permission('purchase.receivals.create') AND NOT public._auth_user_has_permission('purchase.receivals.manage') THEN RAISE EXCEPTION 'Not authorized to create receivals' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1), division_id, division_ids
    INTO v_po_currency, v_po_rate, v_division_id, v_division_ids
    FROM public.purchase_orders
   WHERE id = p_po_id;

  -- Divisions this PO may receive into: the line-division set is authoritative;
  -- fall back to the header division for legacy rows with no set.
  v_allowed_divs := CASE
    WHEN cardinality(COALESCE(v_division_ids, '{}'::uuid[])) > 0 THEN v_division_ids
    WHEN v_division_id IS NOT NULL THEN ARRAY[v_division_id]
    ELSE '{}'::uuid[]
  END;

  IF p_sub_container_id IS NOT NULL THEN
    SELECT sc.warehouse_id, sc.division_id
      INTO v_check_wh, v_check_div
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND sc.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
    END IF;
    IF v_check_wh <> p_warehouse_id THEN
      RAISE EXCEPTION 'Sub-container % does not belong to warehouse %', p_sub_container_id, p_warehouse_id;
    END IF;
    -- The sub-container's division must be one this PO uses (when the PO is
    -- division-scoped). Legacy POs with no divisions let the operator pick any.
    IF cardinality(v_allowed_divs) > 0 AND NOT (v_check_div = ANY(v_allowed_divs)) THEN
      RAISE EXCEPTION 'Sub-container % is in division % which is not on this PO',
        p_sub_container_id, v_check_div;
    END IF;
    -- Per-line routing: every PO line being received in this pass must belong to
    -- the chosen sub-container's division. (Non-PO extras / null-division lines
    -- are exempt.) This keeps each division's stock in its own bin.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS it
      JOIN public.po_line_items li ON li.id = NULLIF(it->>'po_line_item_id', '')::uuid
      WHERE COALESCE((it->>'qty_received')::int, 0) > 0
        AND li.division_id IS NOT NULL
        AND li.division_id IS DISTINCT FROM v_check_div
    ) THEN
      RAISE EXCEPTION 'Some lines being received belong to a different division than the chosen sub-container'
        USING HINT = 'Set the other divisions'' lines to 0 and receive them in a separate pass into their own warehouse / sub-container.';
    END IF;
    v_sub_container_id := p_sub_container_id;
  ELSIF cardinality(v_allowed_divs) <> 1 THEN
    -- Ambiguous destination (multi-division or no division) — require an
    -- explicit sub-container so each line lands in the right division.
    RAISE EXCEPTION 'This PO is not single-division; pick a sub-container so each line lands in its own division'
      USING HINT = 'Select a warehouse + sub-container on the receival form.';
  ELSE
    v_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_allowed_divs[1]);
  END IF;

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id   := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty     := (v_item->>'qty_received')::INT;
    v_cost    := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id  := NULLIF(v_item->>'po_line_item_id', '')::UUID;
    v_is_free := COALESCE((v_item->>'is_free')::BOOLEAN, false);

    -- Free items cost nothing: force a zero cost basis so they add quantity but
    -- neither value nor moving-average cost. Paid items convert to QAR as before.
    v_cost_qar := CASE WHEN v_is_free THEN 0 ELSE v_cost * v_po_rate END;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free,
      sub_container_id
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost, v_is_free,
      v_sub_container_id
    );

    -- Only skip when we cannot place stock (no variant, or non-positive qty).
    -- Free items now DO enter stock (as a zero-cost layer).
    CONTINUE WHEN v_bv_id IS NULL OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate,
      sub_container_id
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    -- received_qty tracks ORDERED fulfilment; a free bonus unit does not count
    -- (otherwise a 100-unit line receiving 100 + 2 free reads 102/100).
    IF v_pli_id IS NOT NULL AND NOT v_is_free THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id,
      sub_container_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      -- Cast the CASE result to the enum: a CASE over string literals resolves to
      -- text, and text does not implicitly coerce to stock_movement_type.
      (CASE WHEN v_is_free THEN 'free_receival' ELSE 'purchase_receival' END)::public.stock_movement_type,
      v_qty, v_cost_qar,
      'receival', v_receival_id,
      v_sub_container_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$function$;

-- ── 2. Per-row stock summary: avg cost excludes zero-cost (free) layers ─────
CREATE OR REPLACE FUNCTION public.refresh_stock_summary_row(p_warehouse_id uuid, p_brand_variant_id uuid, p_sub_container_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty         integer;
  v_avg_cost    numeric;
  v_total_value numeric;
  v_alloc       integer;
  v_item_name   text;
  v_brand       text;
  v_sku         text;
  v_unit        text;
  v_category    text;
  v_subcategory text;
  v_item_type   text;
BEGIN
  IF p_warehouse_id IS NULL OR p_sub_container_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(remaining_qty), 0)::integer,
    -- avg cost = value / qty over PAID layers only (exclude free/zero-cost),
    -- so free units do not dilute the displayed unit cost.
    COALESCE(
      SUM(remaining_qty::numeric * total_unit_cost) FILTER (WHERE total_unit_cost > 0)
      / NULLIF(SUM(remaining_qty) FILTER (WHERE total_unit_cost > 0), 0),
      0),
    -- total value counts every remaining layer (free layers add 0).
    COALESCE(SUM(remaining_qty::numeric * total_unit_cost), 0)
  INTO v_qty, v_avg_cost, v_total_value
  FROM fifo_cost_layers
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id
    AND remaining_qty    > 0;

  SELECT COALESCE(allocated_qty, 0)
  INTO v_alloc
  FROM warehouse_stock_allocations
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id;

  v_alloc := COALESCE(v_alloc, 0);

  IF v_qty = 0 AND v_alloc = 0 THEN
    DELETE FROM warehouse_stock_summary
    WHERE warehouse_id     = p_warehouse_id
      AND sub_container_id = p_sub_container_id
      AND brand_variant_id = p_brand_variant_id;
    RETURN;
  END IF;

  SELECT
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text
  INTO v_item_name, v_brand, v_sku, v_unit,
       v_category, v_subcategory, v_item_type
  FROM inventory_item_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  WHERE ibv.id = p_brand_variant_id;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    v_item_name, v_brand, v_sku, v_unit,
    v_qty, v_avg_cost, v_total_value,
    v_category, v_subcategory, v_item_type,
    v_alloc, GREATEST(v_qty - v_alloc, 0), now()
  )
  ON CONFLICT (warehouse_id, sub_container_id, brand_variant_id) DO UPDATE SET
    item_name        = EXCLUDED.item_name,
    brand            = EXCLUDED.brand,
    sku              = EXCLUDED.sku,
    unit             = EXCLUDED.unit,
    qty              = EXCLUDED.qty,
    avg_cost         = EXCLUDED.avg_cost,
    total_value      = EXCLUDED.total_value,
    category_name    = EXCLUDED.category_name,
    subcategory_name = EXCLUDED.subcategory_name,
    item_type        = EXCLUDED.item_type,
    allocated_qty    = EXCLUDED.allocated_qty,
    available_qty    = EXCLUDED.available_qty,
    updated_at       = EXCLUDED.updated_at;
END;
$function$;

-- ── 3. Bulk stock summary: same avg-cost exclusion ──────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_all_stock_summaries()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  TRUNCATE warehouse_stock_summary;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  )
  SELECT
    f.warehouse_id,
    f.sub_container_id,
    f.brand_variant_id,
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    SUM(f.remaining_qty)::integer,
    -- avg cost over PAID layers only (exclude free/zero-cost).
    COALESCE(
      SUM(f.remaining_qty::numeric * f.total_unit_cost) FILTER (WHERE f.total_unit_cost > 0)
      / NULLIF(SUM(f.remaining_qty) FILTER (WHERE f.total_unit_cost > 0), 0),
      0),
    SUM(f.remaining_qty::numeric * f.total_unit_cost),
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text,
    COALESCE(wsa.allocated_qty, 0),
    GREATEST(SUM(f.remaining_qty)::integer - COALESCE(wsa.allocated_qty, 0), 0),
    now()
  FROM fifo_cost_layers f
  JOIN inventory_item_brand_variants ibv ON ibv.id = f.brand_variant_id
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  LEFT JOIN warehouse_stock_allocations wsa
    ON wsa.warehouse_id     = f.warehouse_id
   AND wsa.sub_container_id = f.sub_container_id
   AND wsa.brand_variant_id = f.brand_variant_id
  WHERE f.remaining_qty     > 0
    AND f.warehouse_id     IS NOT NULL
    AND f.sub_container_id IS NOT NULL
  GROUP BY
    f.warehouse_id, f.sub_container_id, f.brand_variant_id,
    ii.name_en, ibv.brand, ii.sku, ii.unit,
    ic.name_en, ic.type, ic_parent.id, ic_parent.name_en, ic_parent.type,
    wsa.allocated_qty;
END;
$function$;

-- ── 4. Recompute existing summary rows with the new avg-cost rule ───────────
SELECT public.refresh_all_stock_summaries();

NOTIFY pgrst, 'reload schema';
