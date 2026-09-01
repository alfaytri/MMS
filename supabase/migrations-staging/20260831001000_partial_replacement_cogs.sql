-- Phase 3a Task 4: the free replacement/gift now books its cost (deduct FIFO +
-- cogs source_type='sale_replacement' + movement, mirroring a delivery); the
-- inline write-off reverses COGS + emits the damaged_write_off scrap. Revenue
-- for sale_replacement is forced to 0 in rpc_report_pnl (separate migration).
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
  v_layer           RECORD;
  v_repl_sub        uuid;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage')) THEN RAISE EXCEPTION 'Not authorized to create replacements' USING ERRCODE = '42501'; END IF;
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

    -- Phase 3a: destination sub-container for FIFO deduction of the free
    -- replacement / gift lines (mirrors complete_delivery_inventory).
    v_repl_sub := public._find_or_create_sub_container(
      p_warehouse_id,
      coalesce(v_return_division, (SELECT division_id FROM public.sale_orders WHERE id = v_sale_order_id)));
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

    -- Phase 3a: book the replacement's cost. Free swap (customer already paid),
    -- so mirror complete_delivery_inventory (deduct FIFO + one cogs + one
    -- movement per layer) with source_type='sale_replacement' -> the P&L counts
    -- the cost with ZERO revenue (revenue is forced to 0 for this source_type).
    FOR v_layer IN
      SELECT layer_id, qty_taken, unit_cost, total_cost
      FROM public.deduct_fifo_layers(v_return_line.brand_variant_id, p_warehouse_id, v_line_qty::integer, false, v_repl_sub)
    LOOP
      INSERT INTO public.cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id, division_id
      ) VALUES (
        v_return_line.brand_variant_id, v_delivery_id, v_sale_order_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'sale_replacement', v_layer.layer_id, v_return_division
      );
      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, v_repl_sub, v_return_line.brand_variant_id,
        coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', v_delivery_id, 'Free replacement — ' || v_delivery_num
      );
    END LOOP;

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

    -- Phase 3a: gifts also leave inventory free -> book cost (sale_replacement).
    FOR v_layer IN
      SELECT layer_id, qty_taken, unit_cost, total_cost
      FROM public.deduct_fifo_layers(v_gift_variant, p_warehouse_id, v_gift_qty::integer, false, v_repl_sub)
    LOOP
      INSERT INTO public.cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date, source_type, source_id, division_id
      ) VALUES (
        v_gift_variant, v_delivery_id, v_sale_order_id,
        v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'sale_replacement', v_layer.layer_id, v_return_division
      );
      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        p_warehouse_id, v_repl_sub, v_gift_variant,
        coalesce(v_gift_item.item_name, 'Gift'), nullif(v_gift_item.sku, ''),
        'sale_delivery', -v_layer.qty_taken, v_layer.unit_cost,
        'sale_delivery', v_delivery_id, 'Gift on return — ' || v_delivery_num
      );
    END LOOP;
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

        -- Phase 3a: this RPC has its OWN inline write-off; emit the
        -- damaged_write_off the P&L Scrap reads + reverse the sale COGS.
        INSERT INTO public.inventory_damaged_movements (
          movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
          notes, created_by, division_id
        ) VALUES (
          'damaged_write_off', v_disp_qty, v_disp_warehouse, v_return_line.brand_variant_id, v_disp_cost,
          coalesce(v_return_line.condition_notes, 'Written off on customer return'),
          public._current_user_data_id(), coalesce(v_return_division, v_fallback_div)
        );
        PERFORM public._reverse_sale_cogs_for_return(p_return_id, v_return_line.brand_variant_id, v_disp_qty);

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

NOTIFY pgrst, 'reload schema';
