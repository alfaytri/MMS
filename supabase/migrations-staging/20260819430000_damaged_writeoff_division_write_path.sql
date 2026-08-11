-- Division-attributed damaged write-offs — write path.
--
-- 1. _consume_damaged_stock_fifo_returning: like _consume_damaged_stock_fifo but
--    RETURNS the consumed layers (qty, cost, division) so the write-off can book
--    one movement per layer carrying that layer's division. The old void variant
--    is left intact (still used by the send-for-repair flow).
-- 2. approve_stock_adjustment_inventory: damaged write-off branch now loops the
--    returning consume and writes one damaged_write_off per layer (per-layer cost
--    + division); damage branch stamps the source sub-container's division onto
--    the new damaged layer + damaged_adjust movement.
-- 3. _record_inventory_disposition: restock_as_damaged stamps the return's
--    division onto the new damaged layer + restock_as_damaged_in movement.
--
-- Bodies sourced live via pg_get_functiondef (baseline is stale). Only the noted
-- lines changed; everything else is byte-identical.

-- ── 1. FIFO consume that returns the consumed layers ─────────────────────────
CREATE OR REPLACE FUNCTION public._consume_damaged_stock_fifo_returning(
  p_warehouse_id uuid, p_brand_variant_id uuid, p_qty numeric
) RETURNS TABLE(qty_taken numeric, unit_cost numeric, division_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_needed numeric := p_qty;
  v_layer  record;
  v_take   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '_consume_damaged_stock_fifo_returning: qty must be > 0 (got %)', p_qty;
  end if;

  for v_layer in
    select l.id, l.qty_remaining, l.unit_cost AS layer_cost, l.division_id AS layer_div
      from public.inventory_damaged_stock_layers l
     where l.warehouse_id = p_warehouse_id
       and l.brand_variant_id = p_brand_variant_id
       and l.qty_remaining > 0
     order by l.layered_at, l.id
     for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_layer.qty_remaining);
    update public.inventory_damaged_stock_layers
       set qty_remaining = qty_remaining - v_take
     where id = v_layer.id;

    qty_taken   := v_take;
    unit_cost   := v_layer.layer_cost;
    division_id := v_layer.layer_div;
    return next;

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception '_consume_damaged_stock_fifo_returning: insufficient damaged stock at % / % (short by %)',
      p_warehouse_id, p_brand_variant_id, v_needed;
  end if;

  update public.inventory_damaged_stock
     set qty = qty - p_qty, updated_at = now()
   where warehouse_id = p_warehouse_id
     and brand_variant_id = p_brand_variant_id;

  if not found then
    raise exception '_consume_damaged_stock_fifo_returning: aggregate row missing at % / %', p_warehouse_id, p_brand_variant_id;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public._consume_damaged_stock_fifo_returning(uuid, uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public._consume_damaged_stock_fifo_returning(uuid, uuid, numeric) TO service_role;

-- ── 2. approve_stock_adjustment_inventory ────────────────────────────────────
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
  v_dl                  RECORD;
  v_qty                 INT;
  v_sub_container_id    UUID;
  v_layer_sub_container UUID;
  v_layer_division      UUID;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT AS qty,
         reason, status, sub_container_id, source_pile
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

  -- ── Phase F: damaged-pile writeoff branch ──────────────────────────────────
  -- Per-layer: one damaged_write_off movement per consumed layer, carrying that
  -- layer's actual cost + source division so the P&L Scrap line is division-scoped.
  IF v_adj.source_pile = 'damaged' THEN
    IF v_adj.adjustment_type <> 'write_off' THEN
      RAISE EXCEPTION 'source_pile=damaged only supports adjustment_type=write_off (got %)', v_adj.adjustment_type;
    END IF;

    FOR v_dl IN
      SELECT * FROM public._consume_damaged_stock_fifo_returning(
                      v_adj.warehouse_id, v_adj.brand_variant_id, v_qty)
    LOOP
      INSERT INTO public.inventory_damaged_movements (
        movement_type, qty, warehouse_id, brand_variant_id, unit_cost, division_id, notes
      ) VALUES (
        'damaged_write_off', v_dl.qty_taken, v_adj.warehouse_id, v_adj.brand_variant_id,
        v_dl.unit_cost, v_dl.division_id, v_adj.reason
      );
    END LOOP;
    RETURN;
  END IF;

  SELECT * INTO v_bv FROM inventory_item_brand_variants WHERE id = v_adj.brand_variant_id FOR UPDATE;

  IF v_adj.adjustment_type = 'increase' THEN
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      sub_container_id, source_type, source_id
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty,
      v_sub_container_id, 'adjustment', p_adjustment_id
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

      -- C3 fix: for 'damage' adjustments, materialise the damaged-pile
      -- rows so downstream damaged-stock operations can consume them.
      IF v_adj.adjustment_type = 'damage' THEN
        -- Division the stock is being damaged out of (source sub-container).
        SELECT wsc.division_id INTO v_layer_division
        FROM public.warehouse_sub_containers wsc
        WHERE wsc.id = v_layer_sub_container;

        INSERT INTO inventory_damaged_stock_layers (
          warehouse_id, brand_variant_id,
          qty_received, qty_remaining, unit_cost, layered_at, division_id
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.qty_taken, v_layer.unit_cost, now(), v_layer_division
        );

        INSERT INTO inventory_damaged_stock (
          warehouse_id, brand_variant_id, qty, weighted_unit_cost, updated_at
        ) VALUES (
          v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.qty_taken, v_layer.unit_cost, now()
        )
        ON CONFLICT (warehouse_id, brand_variant_id) DO UPDATE
          SET qty = inventory_damaged_stock.qty + EXCLUDED.qty,
              weighted_unit_cost =
                (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost
                   + EXCLUDED.qty * EXCLUDED.weighted_unit_cost)
                / NULLIF(inventory_damaged_stock.qty + EXCLUDED.qty, 0),
              updated_at = now();

        INSERT INTO inventory_damaged_movements (
          movement_type, qty, warehouse_id, brand_variant_id, unit_cost, division_id, notes
        ) VALUES (
          'damaged_adjust', v_layer.qty_taken, v_adj.warehouse_id, v_adj.brand_variant_id,
          v_layer.unit_cost, v_layer_division, v_adj.reason
        );
      END IF;
    END LOOP;

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$function$;

-- ── 3. _record_inventory_disposition (restock stamps the return's division) ──
CREATE OR REPLACE FUNCTION public._record_inventory_disposition(
  p_return_line_id uuid, p_disposition_type text, p_qty numeric,
  p_inventory_stock_movement_id uuid DEFAULT NULL::uuid,
  p_warehouse_transfer_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_warehouse_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_condition     text;
  v_remaining     numeric;
  v_return_id     uuid;
  v_brand_variant uuid;
  v_unit_cost     numeric;
  v_new_id        uuid;
  v_division      uuid;
  v_uid           uuid := public._current_user_data_id();
begin
  if p_disposition_type not in ('write_off','restock_as_damaged','send_for_repair') then
    raise exception '_record_inventory_disposition: invalid disposition_type %', p_disposition_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_inventory_disposition: qty must be > 0 (got %)', p_qty;
  end if;

  select rl.condition, p.inventory_remaining_qty, p.return_id, p.brand_variant_id
    into v_condition, v_remaining, v_return_id, v_brand_variant
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.id = p_return_line_id;
  if v_condition is null then
    raise exception '_record_inventory_disposition: return_line % not found', p_return_line_id;
  end if;
  if v_condition <> 'damaged' then
    raise exception '_record_inventory_disposition: return_line % is not damaged (condition=%)', p_return_line_id, v_condition;
  end if;
  if p_qty > coalesce(v_remaining, 0) then
    raise exception '_record_inventory_disposition: qty % exceeds inventory remaining %', p_qty, coalesce(v_remaining, 0);
  end if;

  if p_disposition_type = 'restock_as_damaged' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for restock_as_damaged';
  end if;
  if p_disposition_type = 'send_for_repair' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for send_for_repair (needed by rpc_send_damaged_for_repair follow-up)';
  end if;

  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  if p_disposition_type = 'restock_as_damaged' then
    v_unit_cost := public._return_line_fifo_unit_cost(v_return_id, p_return_line_id, p_qty);

    -- Division = the return's division (so a damaged restock attributes to it).
    select r.division_id into v_division from public.so_po_returns r where r.id = v_return_id;

    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by, division_id)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, v_uid, v_division);

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_brand_variant, p_qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by, division_id)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, v_uid, v_division
    );
  end if;

  return v_new_id;
end;
$function$;
