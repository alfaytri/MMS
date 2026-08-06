-- ─────────────────────────────────────────────────────────────────────
-- Phase E — Migration A: RPC rewrites (stop touching doomed division_id)
--
-- Six of the nine RPCs surfaced by the Phase E sweep need surgery. The
-- remaining three (cancel_delivery_inventory, complete_delivery_inventory,
-- create_and_approve_receival) only read *_orders.division_id (which
-- stays) and don't stamp `division_id` on any stock-table INSERT — the
-- sync trigger did that for them. When Mig B/C/D drop the column AND the
-- trigger, those three keep working as-is.
--
-- For the six below:
--   * `approve_stock_adjustment_inventory` + `create_stock_adjustment_v2`
--     — the "no sub_container_id passed → derive from warehouses.division_id"
--     fallback is dead code. Since D.4, every adjustment ships with a
--     sub_container_id from the dialog. Remove the fallback and raise a
--     clear error if the caller passes NULL.
--   * `rpc_create_partial_replacement` + `rpc_process_return_restock` —
--     drop the third-level `warehouses.division_id` fallback in the
--     division-derive cascade. Cascade now stops at
--     return → sale_order → raise. This is a net-tightening: an operator
--     who hasn't tagged their SO with a division no longer smuggles stock
--     into whatever division happened to sit on the warehouse row.
--   * `rpc_process_return_restock` — additionally remove `division_id` from
--     its INSERT INTO fifo_cost_layers (the column is going away in Mig D;
--     stamping it now would be a no-op that fails post-Mig-D).
--   * `rpc_send_damaged_for_repair` + `rpc_return_damaged_from_repair` —
--     the source/dest division was previously read off warehouses. Derive
--     it from the disposition's return chain instead:
--       return_line_inventory_dispositions.return_line_id
--         → return_lines.return_id → so_po_returns.division_id
--     Also remove `division_id` from every INSERT INTO warehouse_transfers
--     in those two RPCs (the header column is going away).
--
-- Bodies preserved verbatim from `pg_get_functiondef` snapshots taken
-- 2026-08-02 (post-D.12). Every non-Phase-E line stays byte-for-byte the
-- same — this is a targeted diff, not a rewrite.
--
-- Prior migration: 20260808000300_phase_d14_inventory_defaults.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1. approve_stock_adjustment_inventory ──────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_stock_adjustment_inventory(p_adjustment_id uuid, p_approved_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj                 RECORD;
  v_bv                  RECORD;
  v_layer               RECORD;
  v_qty                 INT;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF v_adj.status NOT IN ('pending', 'pending_approval') THEN
    RAISE EXCEPTION 'Adjustment % already processed with status %', p_adjustment_id, v_adj.status;
  END IF;

  v_qty := v_adj.qty;

  -- Phase E: every adjustment now carries a sub_container_id (D.4 dialog
  -- + create_stock_adjustment_v2 both enforce it). The old
  -- warehouses.division_id fallback is gone.
  IF v_adj.sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % has no sub_container_id; re-open the adjustment dialog and pick one.', p_adjustment_id;
  END IF;
  v_sub_container_id := v_adj.sub_container_id;

  UPDATE stock_adjustments
  SET status           = 'approved',
      approved_by_name = p_approved_by,
      approved_at      = now(),
      sub_container_id = v_sub_container_id
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    SELECT average_cost INTO v_bv
    FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes,
      sub_container_id
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason,
      v_sub_container_id
    );

  ELSIF v_adj.adjustment_type IN ('decrease', 'damage', 'write_off') THEN
    IF v_adj.adjustment_type = 'damage' THEN
      UPDATE inventory_item_brand_variants
      SET damaged_qty = damaged_qty + v_qty, updated_at = now()
      WHERE id = v_adj.brand_variant_id;
    END IF;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost,
             sub_container_id
      FROM deduct_fifo_layers(
        v_adj.brand_variant_id,
        v_adj.warehouse_id,
        v_qty,
        false,
        v_sub_container_id
      )
    LOOP
      v_layer_sub_container := COALESCE(v_layer.sub_container_id, v_sub_container_id);

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, movement_type,
        qty, unit_cost, reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
        -v_layer.qty_taken, v_layer.unit_cost,
        'adjustment', p_adjustment_id, v_adj.reason,
        v_layer_sub_container
      );
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$;

-- 2. create_stock_adjustment_v2 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stock_adjustment_v2(p_warehouse_id uuid, p_brand_variant_id uuid, p_adjustment_type text, p_qty numeric, p_reason text, p_notes text, p_photo_urls text[], p_requested_by uuid, p_requested_by_name text, p_sub_container_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id             uuid;
  v_step           RECORD;
  v_ord            int := 0;
  v_check_wh       uuid;
  v_check_active   boolean;
BEGIN
  IF p_adjustment_type NOT IN ('increase','decrease','damage','write_off') THEN
    RAISE EXCEPTION 'Invalid adjustment_type: %', p_adjustment_type;
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0';
  END IF;

  -- Phase E: sub_container_id is now REQUIRED. The old fallback derived it
  -- from warehouses.division_id, which is gone. Adjustment dialogs (D.4)
  -- already pass it.
  IF p_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'sub_container_id is required — pick one on the adjustment dialog.'
      USING HINT = 'Open the adjustment dialog and pick a sub-container from the picker.';
  END IF;

  SELECT sc.warehouse_id, sc.is_active
    INTO v_check_wh, v_check_active
  FROM   public.warehouse_sub_containers sc
  WHERE  sc.id = p_sub_container_id;

  IF NOT FOUND OR v_check_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Sub-container % not found or inactive', p_sub_container_id;
  END IF;
  IF v_check_wh <> p_warehouse_id THEN
    RAISE EXCEPTION 'Sub-container % does not belong to warehouse %',
      p_sub_container_id, p_warehouse_id;
  END IF;

  INSERT INTO stock_adjustments (
    warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
    reason, notes, photo_urls, status,
    requested_by, requested_by_name
  ) VALUES (
    p_warehouse_id,
    p_sub_container_id,
    p_brand_variant_id,
    p_adjustment_type::public.stock_adjustment_type,
    p_qty,
    p_reason,
    NULLIF(p_notes,''),
    COALESCE(p_photo_urls, '{}'::text[]),
    'pending_approval',
    p_requested_by,
    p_requested_by_name
  )
  RETURNING id INTO v_id;

  FOR v_step IN
    SELECT step_key, step_label, is_conditional, condition_types
    FROM   approval_workflow_steps
    WHERE  workflow = 'stock_adj'
      AND  is_active = true
      AND  archived_at IS NULL
    ORDER BY step_order
  LOOP
    IF v_step.is_conditional AND NOT (p_adjustment_type = ANY(v_step.condition_types)) THEN
      CONTINUE;
    END IF;

    v_ord := v_ord + 1;
    INSERT INTO stock_adjustment_approvals (adjustment_id, step_order, step_role, step_label)
    VALUES (v_id, v_ord, v_step.step_key, v_step.step_label);
  END LOOP;

  IF v_ord = 0 THEN
    RAISE EXCEPTION 'No approval steps configured for stock_adj workflow';
  END IF;

  RETURN v_id;
END;
$function$;

-- 3. rpc_process_return_restock ──────────────────────────────────────
--    Drops warehouse-based division fallback + drops `division_id` from
--    the fifo_cost_layers INSERT (column is going away in Mig D).
CREATE OR REPLACE FUNCTION public.rpc_process_return_restock(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return             RECORD;
  v_line               RECORD;
  v_cogs               RECORD;
  v_qty_remaining      int;
  v_qty_this_chunk     numeric;
  v_available_qty      numeric;
  v_pending_insp       int;
  v_line_warehouse     uuid;
  v_line_sub_container uuid;
  v_fallback_division  uuid;
BEGIN
  SELECT id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.restocked_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_return.status <> 'restocked' THEN
    RAISE EXCEPTION 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  END IF;

  IF v_return.source_type <> 'sale_order' THEN
    RAISE EXCEPTION 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  END IF;

  SELECT count(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty, condition, condition_notes,
           sale_delivery_line_id
    FROM   return_lines
    WHERE  return_id = p_return_id
      AND  brand_variant_id IS NOT NULL
      AND  qty > 0
      AND  condition = 'good'
  LOOP
    IF v_line.sale_delivery_line_id IS NULL THEN
      RAISE EXCEPTION 'Return line % has no sale_delivery_line_id link; cannot derive restock destination.',
        v_line.id
        USING HINT = 'Legacy return that predates Warehouse Model v2 D.4.b. Contact ops to reconcile.';
    END IF;

    SELECT sd.warehouse_id,
           fcl.sub_container_id
    INTO   v_line_warehouse, v_line_sub_container
    FROM   public.sale_delivery_lines sdl
    JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
    JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                         AND ce.brand_variant_id = sdl.brand_variant_id
    JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
    WHERE  sdl.id = v_line.sale_delivery_line_id
    ORDER  BY ce.created_at ASC
    LIMIT  1;

    -- Fallback for pre-D.3 deliveries. Phase E: division-derive cascade
    -- shortens to return → SO. Warehouse-based fallback is gone.
    IF v_line_warehouse IS NULL OR v_line_sub_container IS NULL THEN
      SELECT sd.warehouse_id
      INTO   v_line_warehouse
      FROM   public.sale_delivery_lines sdl
      JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
      WHERE  sdl.id = v_line.sale_delivery_line_id;

      IF v_line_warehouse IS NULL THEN
        RAISE EXCEPTION 'Return line %: cannot resolve warehouse from delivery_line %.',
          v_line.id, v_line.sale_delivery_line_id;
      END IF;

      v_fallback_division := v_return.division_id;

      IF v_fallback_division IS NULL THEN
        SELECT so.division_id
        INTO   v_fallback_division
        FROM   public.sale_orders so
        WHERE  so.id = v_return.source_id;
      END IF;

      IF v_fallback_division IS NULL THEN
        RAISE EXCEPTION 'Return line %: pre-D.3 delivery has no source_id chain AND division cannot be resolved from return or sale_order.',
          v_line.id
          USING HINT = 'Set division_id on the return or sale_order before restocking.';
      END IF;

      v_line_sub_container := public._find_or_create_sub_container(v_line_warehouse, v_fallback_division);
    END IF;

    SELECT coalesce(sum(qty), 0)
    INTO   v_available_qty
    FROM   cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = v_line.brand_variant_id
      AND  qty > 0;

    IF v_available_qty < v_line.qty THEN
      RAISE EXCEPTION 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    END IF;

    v_qty_remaining := v_line.qty;

    FOR v_cogs IN
      SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      FROM   cogs_entries
      WHERE  sale_order_id = v_return.source_id
        AND  brand_variant_id = v_line.brand_variant_id
        AND  qty > 0
      ORDER  BY date ASC, unit_cost ASC, id ASC
    LOOP
      EXIT WHEN v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      -- Phase E: fifo_cost_layers.division_id is gone. cogs_entries.division_id
      -- stays (that table's not in the Phase E drop set), so continue stamping
      -- it below.
      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id,
        sub_container_id
      ) VALUES (
        v_line.brand_variant_id,
        v_line_warehouse,
        current_date,
        v_qty_this_chunk,
        v_cogs.unit_cost,
        0,
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_line_sub_container
      );

      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) VALUES (
        v_line.brand_variant_id,
        v_cogs.sale_delivery_id,
        v_cogs.sale_order_id,
        -v_qty_this_chunk,
        v_cogs.unit_cost,
        -(v_qty_this_chunk * v_cogs.unit_cost),
        current_date,
        'sale_return',
        v_return.division_id,
        'Reversed by return ' || v_return.return_number
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes,
        sub_container_id
      ) VALUES (
        v_line_warehouse,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number,
        v_line_sub_container
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    END LOOP;

    IF v_qty_remaining > 0 THEN
      RAISE EXCEPTION 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    END IF;

    UPDATE inventory_item_brand_variants
    SET    stock_level = stock_level + v_line.qty,
           updated_at  = now()
    WHERE  id = v_line.brand_variant_id;

    PERFORM recalc_average_cost(v_line.brand_variant_id);
  END LOOP;

  UPDATE so_po_returns
  SET    restocked_at = now()
  WHERE  id = p_return_id;
END;
$function$;

-- 4. rpc_create_partial_replacement ──────────────────────────────────
--    Cascade shortened: return → SO → raise. Warehouse-based fallback
--    (last-resort) is removed.
CREATE OR REPLACE FUNCTION public.rpc_create_partial_replacement(p_return_id uuid, p_warehouse_id uuid, p_lines jsonb, p_gift_items jsonb DEFAULT '[]'::jsonb, p_dispositions jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_sale_order_id   uuid;
  v_delivery_id     uuid;
  v_delivery_num    text;
  v_return_line     RECORD;
  v_line            jsonb;
  v_line_id         uuid;
  v_line_qty        numeric;
  v_gift            jsonb;
  v_gift_variant    uuid;
  v_gift_qty        numeric;
  v_gift_item       RECORD;
  v_disp            jsonb;
  v_disp_line_id    uuid;
  v_disp_type       text;
  v_disp_qty        numeric;
  v_disp_transfer   uuid;
  v_disp_cost       numeric;
  v_mov_id          uuid;
  v_disp_warehouse  uuid;
  v_disp_sub_cont   uuid;
  v_return_division uuid;
  v_fallback_div    uuid;
BEGIN
  SELECT id, source_id, status, division_id
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: return % not found', p_return_id;
  END IF;

  v_sale_order_id   := v_return.source_id;
  v_return_division := v_return.division_id;

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'rpc_create_partial_replacement: p_lines must be a jsonb array';
  END IF;

  IF jsonb_array_length(p_lines) > 0 OR jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 THEN
    v_delivery_num := public.next_delivery_number();
    INSERT INTO public.sale_deliveries (
      delivery_number, sale_order_id, warehouse_id, date,
      status, type, return_id
    ) VALUES (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', p_return_id
    ) RETURNING id INTO v_delivery_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT rl.brand_variant_id, rl.item_name, rl.sku
      INTO v_return_line
      FROM public.return_lines rl
      WHERE rl.id = v_line_id AND rl.return_id = p_return_id;
    IF v_return_line.item_name IS NULL THEN
      RAISE EXCEPTION 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    END IF;

    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty::integer
    );

    PERFORM public._record_customer_resolution(
      p_return_line_id    => v_line_id,
      p_resolution_type   => 'replacement',
      p_qty               => v_line_qty,
      p_sale_delivery_id  => v_delivery_id
    );
  END LOOP;

  FOR v_gift IN SELECT * FROM jsonb_array_elements(coalesce(p_gift_items, '[]'::jsonb)) LOOP
    v_gift_variant := (v_gift->>'brand_variant_id')::uuid;
    v_gift_qty     := (v_gift->>'qty')::numeric;
    IF v_gift_variant IS NULL OR v_gift_qty IS NULL OR v_gift_qty <= 0 THEN
      CONTINUE;
    END IF;
    SELECT item_name, sku INTO v_gift_item
      FROM public.inventory_item_brand_variants WHERE id = v_gift_variant;
    INSERT INTO public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty::integer
    );
  END LOOP;

  IF jsonb_typeof(p_dispositions) = 'array' AND jsonb_array_length(p_dispositions) > 0 THEN
    FOR v_disp IN SELECT * FROM jsonb_array_elements(p_dispositions) LOOP
      v_disp_line_id  := (v_disp->>'return_line_id')::uuid;
      v_disp_type     := v_disp->>'type';
      v_disp_qty      := (v_disp->>'qty')::numeric;
      v_disp_transfer := nullif(v_disp->>'transfer_id', '')::uuid;

      IF v_disp_type = 'write_off' THEN
        SELECT rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.sale_delivery_line_id
          INTO v_return_line
          FROM public.return_lines rl
          WHERE rl.id = v_disp_line_id;
        IF v_return_line.item_name IS NULL THEN
          RAISE EXCEPTION 'rpc_create_partial_replacement: disposition return_line % not found', v_disp_line_id;
        END IF;

        v_disp_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

        v_disp_warehouse := NULL;
        v_disp_sub_cont  := NULL;

        IF v_return_line.sale_delivery_line_id IS NOT NULL THEN
          SELECT sd.warehouse_id, fcl.sub_container_id
          INTO   v_disp_warehouse, v_disp_sub_cont
          FROM   public.sale_delivery_lines sdl
          JOIN   public.sale_deliveries     sd  ON sd.id = sdl.sale_delivery_id
          JOIN   public.cogs_entries        ce  ON ce.sale_delivery_id = sd.id
                                               AND ce.brand_variant_id = sdl.brand_variant_id
          JOIN   public.fifo_cost_layers    fcl ON fcl.id = ce.source_id
          WHERE  sdl.id = v_return_line.sale_delivery_line_id
          ORDER  BY ce.created_at ASC
          LIMIT  1;
        END IF;

        -- Phase E: cascade is return → SO → raise. Warehouse fallback removed.
        IF v_disp_warehouse IS NULL OR v_disp_sub_cont IS NULL THEN
          v_disp_warehouse := p_warehouse_id;

          v_fallback_div := v_return_division;

          IF v_fallback_div IS NULL THEN
            SELECT so.division_id INTO v_fallback_div
            FROM   public.sale_orders so WHERE so.id = v_sale_order_id;
          END IF;

          IF v_fallback_div IS NULL THEN
            RAISE EXCEPTION 'rpc_create_partial_replacement: write_off cannot resolve division from return or sale_order for warehouse %.',
              p_warehouse_id
              USING HINT = 'Set division_id on the return or sale_order before writing off.';
          END IF;

          v_disp_sub_cont := public._find_or_create_sub_container(p_warehouse_id, v_fallback_div);
        END IF;

        INSERT INTO public.inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) VALUES (
          v_disp_warehouse, v_disp_sub_cont,
          v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
          v_disp_cost,
          'return', p_return_id,
          coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
        ) RETURNING id INTO v_mov_id;

        PERFORM public._record_inventory_disposition(
          p_return_line_id              => v_disp_line_id,
          p_disposition_type            => 'write_off',
          p_qty                         => v_disp_qty,
          p_inventory_stock_movement_id => v_mov_id
        );

      ELSIF v_disp_type = 'restock_as_damaged' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'restock_as_damaged',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSIF v_disp_type = 'send_for_repair' THEN
        PERFORM public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'send_for_repair',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      ELSE
        RAISE EXCEPTION 'rpc_create_partial_replacement: unknown disposition type %', v_disp_type;
      END IF;
    END LOOP;
  END IF;

  PERFORM public._maybe_close_return(p_return_id);
  RETURN v_delivery_id;
END;
$function$;

-- 5. rpc_send_damaged_for_repair ─────────────────────────────────────
--    v_source_division now derived from the disposition's return chain.
--    warehouse_transfers.division_id removed from INSERT.
CREATE OR REPLACE FUNCTION public.rpc_send_damaged_for_repair(p_return_line_disposition_id uuid, p_repair_vendor_id uuid, p_warehouse_id uuid, p_expected_return_date date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disp                  record;
  v_return_line           record;
  v_vendor                record;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
  select id, return_line_id, disposition_type, qty, warehouse_transfer_id
    into v_disp
    from public.return_line_inventory_dispositions
    where id = p_return_line_disposition_id
    for update;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: disposition % not found', p_return_line_disposition_id;
  end if;
  if v_disp.disposition_type <> 'send_for_repair' then
    raise exception 'rpc_send_damaged_for_repair: disposition % is % (expected send_for_repair)',
      p_return_line_disposition_id, v_disp.disposition_type;
  end if;
  if v_disp.warehouse_transfer_id is not null then
    raise exception 'rpc_send_damaged_for_repair: disposition % already linked to transfer %',
      p_return_line_disposition_id, v_disp.warehouse_transfer_id;
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no virtual warehouse (trigger misfire?)', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no sub_container_id (D.6.b backfill missed?)', p_repair_vendor_id;
  end if;

  -- Phase E: derive source division from the disposition's return chain.
  -- Warehouses no longer carry division_id.
  select r.division_id
    into v_source_division
    from public.return_lines rl
    join public.so_po_returns r on r.id = rl.return_id
    where rl.id = v_disp.return_line_id;
  if v_source_division is null then
    raise exception 'rpc_send_damaged_for_repair: return has no division_id — cannot derive source sub-container for warehouse %.', p_warehouse_id
      USING HINT = 'Set division_id on the return before dispatching to repair.';
  end if;

  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, v_uid);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), v_uid
    );
  end if;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_source_division);
  v_to_sub_container_id   := v_vendor.sub_container_id;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_return_line_disposition_id, p_expected_return_date,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, v_return_line.brand_variant_id,
    coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
    v_disp.qty::integer, v_unit_cost, v_disp.qty::integer,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
    v_disp.id, v_transfer_id, p_notes, v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$function$;

-- 6. rpc_return_damaged_from_repair ──────────────────────────────────
--    v_dest_division derived from disposition's return chain.
--    warehouse_transfers.division_id removed from both INSERTs.
CREATE OR REPLACE FUNCTION public.rpc_return_damaged_from_repair(p_transfer_id uuid, p_outcome text, p_qty_good numeric, p_qty_writeoff numeric, p_repair_cost numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_transfer              record;
  v_disp_id               uuid;
  v_variant               uuid;
  v_qty_out               numeric;
  v_unit_cost_base        numeric;
  v_unit_cost_good        numeric;
  v_wh_source             uuid;
  v_wh_vendor             uuid;
  v_dest_division         uuid;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_item_name             text;
  v_item_sku              text;
  v_new_transfer          uuid;
  v_transfer_num          text;
  v_uid                   uuid := public._current_user_data_id();
begin
  if p_outcome not in ('good','writeoff','mixed') then
    raise exception 'rpc_return_damaged_from_repair: invalid outcome % (expected good | writeoff | mixed)', p_outcome;
  end if;
  if coalesce(p_qty_good, 0) < 0 or coalesce(p_qty_writeoff, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: qty values must be >= 0';
  end if;
  if coalesce(p_repair_cost, 0) < 0 then
    raise exception 'rpc_return_damaged_from_repair: repair_cost must be >= 0';
  end if;
  if p_outcome = 'good'     and coalesce(p_qty_writeoff, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=good but qty_writeoff=%', p_qty_writeoff;
  end if;
  if p_outcome = 'writeoff' and coalesce(p_qty_good, 0) > 0 then
    raise exception 'rpc_return_damaged_from_repair: outcome=writeoff but qty_good=%', p_qty_good;
  end if;
  if p_outcome = 'mixed'    and (coalesce(p_qty_good, 0) = 0 or coalesce(p_qty_writeoff, 0) = 0) then
    raise exception 'rpc_return_damaged_from_repair: outcome=mixed requires both qty_good and qty_writeoff > 0';
  end if;

  select id, transfer_kind, status, from_warehouse_id, to_warehouse_id,
         repair_vendor_id, source_return_line_disposition_id, to_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;
  if not found then
    raise exception 'rpc_return_damaged_from_repair: transfer % not found', p_transfer_id;
  end if;
  if v_transfer.transfer_kind <> 'damaged_repair_out' then
    raise exception 'rpc_return_damaged_from_repair: transfer % kind is % (expected damaged_repair_out)',
      p_transfer_id, v_transfer.transfer_kind;
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'rpc_return_damaged_from_repair: transfer % status is % (expected in_transit)',
      p_transfer_id, v_transfer.status;
  end if;

  v_disp_id   := v_transfer.source_return_line_disposition_id;
  v_wh_source := v_transfer.from_warehouse_id;
  v_wh_vendor := v_transfer.to_warehouse_id;

  -- Phase E: derive destination division from the disposition's return chain.
  select r.division_id
    into v_dest_division
    from public.return_line_inventory_dispositions d
    join public.return_lines rl on rl.id = d.return_line_id
    join public.so_po_returns r on r.id = rl.return_id
    where d.id = v_disp_id;
  if v_dest_division is null then
    raise exception 'rpc_return_damaged_from_repair: source return has no division_id — cannot derive destination sub-container.'
      USING HINT = 'Set division_id on the source return before receiving the repair transfer.';
  end if;

  v_from_sub_container_id := v_transfer.to_sub_container_id;
  if v_from_sub_container_id is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no to_sub_container_id (pre-D.4 legacy?)', p_transfer_id;
  end if;

  v_to_sub_container_id := public._find_or_create_sub_container(v_wh_source, v_dest_division);

  select brand_variant_id, item_name, sku, requested_qty::numeric, unit_cost
    into v_variant, v_item_name, v_item_sku, v_qty_out, v_unit_cost_base
    from public.warehouse_transfer_items
    where transfer_id = p_transfer_id
    order by created_at
    limit 1;

  if v_variant is null then
    raise exception 'rpc_return_damaged_from_repair: transfer % has no warehouse_transfer_items row', p_transfer_id;
  end if;

  if coalesce(p_qty_good, 0) + coalesce(p_qty_writeoff, 0) <> v_qty_out then
    raise exception 'rpc_return_damaged_from_repair: qty_good (%) + qty_writeoff (%) must equal transfer qty (%)',
      p_qty_good, p_qty_writeoff, v_qty_out;
  end if;

  v_unit_cost_good := coalesce(v_unit_cost_base, 0)
                    + case when coalesce(p_qty_good, 0) > 0
                           then coalesce(p_repair_cost, 0) / p_qty_good
                           else 0 end;

  if p_qty_good > 0 then
    insert into public.fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_type, source_id,
      sub_container_id
    ) values (
      v_variant, v_wh_source, current_date,
      p_qty_good::integer, v_unit_cost_good, 0, v_unit_cost_good, p_qty_good::integer,
      'damaged_repair_return', p_transfer_id,
      v_to_sub_container_id
    );

    update public.inventory_item_brand_variants
       set stock_level = stock_level + p_qty_good::integer,
           updated_at  = now()
     where id = v_variant;

    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    ) values (
      v_wh_source, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      'damaged_return_from_repair_as_good'::public.stock_movement_type,
      p_qty_good::integer, v_unit_cost_good,
      'warehouse_transfer', p_transfer_id,
      coalesce(p_notes, format('Return from repair (transfer %s) — %s units good, repair cost %s',
                               v_transfer.repair_vendor_id, p_qty_good, coalesce(p_repair_cost, 0))),
      v_to_sub_container_id
    );

    perform public.recalc_average_cost(v_variant);

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id, repair_cost,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_good', v_transfer.repair_vendor_id, v_disp_id, p_repair_cost,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_good::integer, v_unit_cost_good, p_qty_good::integer,
      v_to_sub_container_id
    );
  end if;

  if p_qty_writeoff > 0 then
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, source_transfer_id, notes, created_by)
    values (
      'return_from_repair_as_writeoff', p_qty_writeoff, v_wh_source, v_variant, coalesce(v_unit_cost_base, 0),
      v_disp_id, p_transfer_id,
      coalesce(p_notes, format('Return from repair — %s units written off (unrecoverable)', p_qty_writeoff)),
      v_uid
    );

    v_transfer_num := public.generate_transfer_number();
    insert into public.warehouse_transfers (
      transfer_number, from_warehouse_id, to_warehouse_id,
      status, date, notes,
      transfer_kind, repair_vendor_id, source_return_line_disposition_id,
      from_sub_container_id, to_sub_container_id,
      created_by_profile_id, received_by_profile_id, received_at
    ) values (
      v_transfer_num, v_wh_vendor, v_wh_source,
      'received', current_date, p_notes,
      'damaged_repair_return_writeoff', v_transfer.repair_vendor_id, v_disp_id,
      v_from_sub_container_id, v_to_sub_container_id,
      v_uid, v_uid, now()
    )
    returning id into v_new_transfer;

    insert into public.warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, received_qty,
      sub_container_id
    ) values (
      v_new_transfer, v_variant, coalesce(v_item_name, ''), nullif(v_item_sku, ''),
      p_qty_writeoff::integer, coalesce(v_unit_cost_base, 0), 0,
      v_to_sub_container_id
    );
  end if;

  update public.warehouse_transfers
     set status                 = 'received',
         received_at            = now(),
         received_by_profile_id = v_uid,
         repair_cost            = coalesce(p_repair_cost, 0)
   where id = p_transfer_id;
end;
$function$;
