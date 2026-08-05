-- Phase 7 — Sub-task 7.7 sub-commit: fix write-off double stock-movement + cost.
--
-- Two Phase 6 → 7 seams collided:
--
-- 1. rpc_process_return_restock still writes a `sale_return_damaged` audit
--    marker for damaged return_lines at restock time (Phase 6 behavior — see
--    ELSE branch inside the cogs FIFO loop). Under Phase 7 the disposition
--    RPCs also write their own `sale_return_damaged` movement, so every damaged
--    write-off now generates TWO movement rows per unit: one at restock, one
--    at disposition. The restock row is not linked to any
--    return_line_inventory_dispositions row — it's an orphaned marker.
--
-- 2. Both disposition RPCs (rpc_create_partial_replacement disposition loop +
--    rpc_record_inventory_disposition) insert into inventory_stock_movements
--    without a unit_cost, so the cost defaults to 0. The write-off's true cost
--    (FIFO from cogs_entries for the original SO delivery) is missing from the
--    ledger.
--
-- Stock impact: none — `sale_return_damaged` is audit-only. This is a
-- reporting/P&L visibility bug, not an inventory-quantity bug.
--
-- Fix:
--   - Restrict the restock RPC's FIFO loop to good lines only. Damaged lines
--     are silent at restock and become visible in inventory only when an
--     explicit disposition action fires (matches the Phase 7 spec).
--   - Rewrite both disposition write-off paths to compute FIFO unit_cost from
--     cogs_entries for the return's source SO + brand_variant, using the same
--     ORDER BY date ASC, unit_cost ASC, id ASC pattern the restock RPC uses on
--     the good branch. Weighted-average across chunks → one movement row per
--     disposition (aggregate is enough for reporting; the ledger row already
--     ties movement ↔ disposition 1:1).
--   - Cleanup: fix existing dispositions whose linked movement has cost=0 by
--     stamping the correct FIFO cost, and delete orphan Phase-6 markers (no
--     disposition row pointing at them).

-- ─── 1. rpc_process_return_restock — good-only inner loop ────────────────

create or replace function public.rpc_process_return_restock(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_return          record;
  v_line            record;
  v_cogs            record;
  v_qty_remaining   int;
  v_qty_this_chunk  numeric;
  v_available_qty   numeric;
  v_pending_insp    int;
begin
  select id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  into   v_return
  from   so_po_returns
  where  id = p_return_id
  for update;

  if not found then
    raise exception 'Return % not found', p_return_id;
  end if;

  if v_return.restocked_at is not null then
    return;
  end if;

  if v_return.status <> 'restocked' then
    raise exception 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  end if;

  if v_return.source_type <> 'sale_order' then
    raise exception 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  end if;

  if v_return.restock_warehouse_id is null then
    raise exception 'Return % has no restock_warehouse_id set', p_return_id;
  end if;

  select count(*)
  into   v_pending_insp
  from   return_lines
  where  return_id = p_return_id
    and  condition = 'inspection';

  if v_pending_insp > 0 then
    raise exception 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  end if;

  -- Phase 7: iterate GOOD lines only. Damaged lines wait for an explicit
  -- disposition action (write_off / restock_as_damaged / send_for_repair) and
  -- their inventory movements are booked there, not here.
  for v_line in
    select id, brand_variant_id, item_name, sku, qty, condition, condition_notes
    from   return_lines
    where  return_id = p_return_id
      and  brand_variant_id is not null
      and  qty > 0
      and  condition = 'good'
  loop
    select coalesce(sum(qty), 0)
    into   v_available_qty
    from   cogs_entries
    where  sale_order_id = v_return.source_id
      and  brand_variant_id = v_line.brand_variant_id
      and  qty > 0;

    if v_available_qty < v_line.qty then
      raise exception 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    end if;

    v_qty_remaining := v_line.qty;

    for v_cogs in
      select id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      from   cogs_entries
      where  sale_order_id = v_return.source_id
        and  brand_variant_id = v_line.brand_variant_id
        and  qty > 0
      order  by date asc, unit_cost asc, id asc
    loop
      exit when v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      insert into fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id, division_id
      ) values (
        v_line.brand_variant_id,
        v_return.restock_warehouse_id,
        current_date,
        v_qty_this_chunk,
        v_cogs.unit_cost,
        0,
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_return.division_id
      );

      insert into cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) values (
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

      insert into inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) values (
        v_return.restock_warehouse_id,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    end loop;

    if v_qty_remaining > 0 then
      raise exception 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    end if;

    update inventory_item_brand_variants
    set    stock_level = stock_level + v_line.qty,
           updated_at  = now()
    where  id = v_line.brand_variant_id;

    perform recalc_average_cost(v_line.brand_variant_id);
  end loop;

  update so_po_returns
  set    restocked_at = now()
  where  id = p_return_id;
end;
$function$;

-- ─── 2. Internal helper: FIFO cost lookup for a damaged return_line ──────
-- Weighted-average unit cost over the cogs_entries chunks the requested qty
-- would consume, in FIFO order. Read-only — does NOT consume cogs_entries.

create or replace function public._return_line_fifo_unit_cost(
  p_return_id      uuid,
  p_return_line_id uuid,
  p_qty            numeric
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id       uuid;
  v_brand_variant   uuid;
  v_qty_remaining   numeric := p_qty;
  v_qty_this_chunk  numeric;
  v_total_cost      numeric := 0;
  v_cogs            record;
begin
  select r.source_id, rl.brand_variant_id
    into v_source_id, v_brand_variant
    from public.so_po_returns r
    join public.return_lines rl on rl.return_id = r.id
    where r.id = p_return_id
      and rl.id = p_return_line_id;

  if v_source_id is null or v_brand_variant is null then
    return 0;
  end if;

  for v_cogs in
    select qty, unit_cost
      from public.cogs_entries
      where sale_order_id = v_source_id
        and brand_variant_id = v_brand_variant
        and qty > 0
      order by date asc, unit_cost asc, id asc
  loop
    exit when v_qty_remaining <= 0;
    v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);
    v_total_cost := v_total_cost + (v_qty_this_chunk * v_cogs.unit_cost);
    v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
  end loop;

  if p_qty > 0 then
    return round(v_total_cost / p_qty, 4);
  end if;
  return 0;
end;
$$;

revoke all on function public._return_line_fifo_unit_cost(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public._return_line_fifo_unit_cost(uuid, uuid, numeric) to service_role;

comment on function public._return_line_fifo_unit_cost is
  'Internal. Weighted-average FIFO unit_cost for a return_line''s brand_variant against its source sale_order, over p_qty. Read-only.';

-- ─── 3. Rewrite rpc_record_inventory_disposition to stamp cost ───────────

create or replace function public.rpc_record_inventory_disposition(
  p_return_id     uuid,
  p_warehouse_id  uuid,
  p_dispositions  jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp         jsonb;
  v_disp_line_id uuid;
  v_disp_type    text;
  v_disp_qty     numeric;
  v_return_line  record;
  v_mov_id       uuid;
  v_unit_cost    numeric;
  v_count        int := 0;
begin
  if not exists (
    select 1 from public.so_po_returns
    where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_record_inventory_disposition: return % not found', p_return_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_record_inventory_disposition: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_dispositions) <> 'array' or jsonb_array_length(p_dispositions) = 0 then
    raise exception 'rpc_record_inventory_disposition: p_dispositions must be a non-empty array';
  end if;

  for v_disp in select * from jsonb_array_elements(p_dispositions) loop
    v_disp_line_id := (v_disp->>'return_line_id')::uuid;
    v_disp_type    := v_disp->>'type';
    v_disp_qty     := (v_disp->>'qty')::numeric;

    if v_disp_type = 'write_off' then
      select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.return_id
        into v_return_line
        from public.return_lines rl
        where rl.id = v_disp_line_id;
      if v_return_line.item_name is null then
        raise exception 'rpc_record_inventory_disposition: return_line % not found', v_disp_line_id;
      end if;
      if v_return_line.return_id <> p_return_id then
        raise exception 'rpc_record_inventory_disposition: return_line % does not belong to return %', v_disp_line_id, p_return_id;
      end if;

      v_unit_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

      insert into public.inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
        v_unit_cost,
        'return', p_return_id,
        coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
      ) returning id into v_mov_id;

      perform public._record_inventory_disposition(
        p_return_line_id              => v_disp_line_id,
        p_disposition_type            => 'write_off',
        p_qty                         => v_disp_qty,
        p_inventory_stock_movement_id => v_mov_id
      );

    elsif v_disp_type = 'restock_as_damaged' then
      raise exception 'rpc_record_inventory_disposition: disposition type restock_as_damaged is not yet implemented (Phase 8)';

    elsif v_disp_type = 'send_for_repair' then
      raise exception 'rpc_record_inventory_disposition: disposition type send_for_repair is not yet implemented (Phase 9)';

    else
      raise exception 'rpc_record_inventory_disposition: unknown disposition type %', v_disp_type;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public._maybe_close_return(p_return_id);
  end if;
  return v_count;
end;
$$;

grant execute on function public.rpc_record_inventory_disposition(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.rpc_record_inventory_disposition is
  'After-the-fact inventory disposition for damaged returns. Iterates p_dispositions and books an inventory_stock_movements row (FIFO cost via _return_line_fifo_unit_cost) + return_line_inventory_dispositions row for each. Phase 7 supports only type=write_off; restock_as_damaged / send_for_repair raise "not yet implemented". Closes the return if both ledgers cover.';

-- ─── 4. Patch rpc_create_partial_replacement disposition loop cost ───────
-- Replace the unit_cost=0 insert with a FIFO-cost insert via the same helper.
-- Full function body preserved; only the write-off block inside the
-- p_dispositions loop changes (adds unit_cost column + FIFO lookup).

create or replace function public.rpc_create_partial_replacement(
  p_return_id    uuid,
  p_warehouse_id uuid,
  p_lines        jsonb,
  p_gift_items   jsonb default '[]'::jsonb,
  p_dispositions jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return         record;
  v_customer_id    uuid;
  v_sale_order_id  uuid;
  v_division_id    uuid;
  v_delivery_id    uuid;
  v_delivery_num   text;
  v_line           jsonb;
  v_line_id        uuid;
  v_line_qty       numeric;
  v_return_line    record;
  v_gift           jsonb;
  v_gift_variant   uuid;
  v_gift_qty       numeric;
  v_gift_item      record;
  v_disp           jsonb;
  v_disp_line_id   uuid;
  v_disp_type      text;
  v_disp_qty       numeric;
  v_disp_transfer  uuid;
  v_mov_id         uuid;
  v_disp_cost      numeric;
begin
  select id, source_type, source_id, division_id, status, return_number
    into v_return
    from public.so_po_returns
    where id = p_return_id and deleted_at is null
    for update;
  if not found then
    raise exception 'rpc_create_partial_replacement: return % not found', p_return_id;
  end if;
  if v_return.source_type <> 'sale_order' then
    raise exception 'rpc_create_partial_replacement: expected source_type=sale_order, got %', v_return.source_type;
  end if;
  if v_return.status not in ('restocked','resolved_credit','resolved_replacement','resolved_partial') then
    raise exception 'rpc_create_partial_replacement: return % status is % — must be restocked or a resolved_* value', v_return.return_number, v_return.status;
  end if;

  v_sale_order_id := v_return.source_id;
  v_division_id   := v_return.division_id;

  select customer_id into v_customer_id
    from public.sale_orders where id = v_sale_order_id;
  if v_customer_id is null then
    raise exception 'rpc_create_partial_replacement: sale_order % has no customer', v_sale_order_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_create_partial_replacement: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'rpc_create_partial_replacement: p_lines must be a jsonb array';
  end if;

  -- 1. Create the replacement delivery header (only when we have real lines OR gifts).
  if jsonb_array_length(p_lines) > 0 or jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 then
    v_delivery_num := public.next_delivery_number();
    insert into public.sale_deliveries (
      delivery_number, sale_order_id, warehouse_id, delivery_date,
      status, type, division_id, notes
    ) values (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', v_division_id,
      'Replacement for return ' || v_return.return_number
    ) returning id into v_delivery_id;
  end if;

  -- 2. Iterate replacement lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    if v_line_qty is null or v_line_qty <= 0 then
      continue;
    end if;

    select rl.brand_variant_id, rl.item_name, rl.sku, rl.unit_price
      into v_return_line
      from public.return_lines rl
      where rl.id = v_line_id and rl.return_id = p_return_id;
    if v_return_line.item_name is null then
      raise exception 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    end if;

    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku,
      qty, unit_price
    ) values (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty, coalesce(v_return_line.unit_price, 0)
    );

    perform public._record_customer_resolution(
      p_return_line_id    => v_line_id,
      p_resolution_type   => 'replacement',
      p_qty               => v_line_qty,
      p_sale_delivery_id  => v_delivery_id
    );
  end loop;

  -- 3. Gift items (goodwill add-ons — no ledger, just delivery lines)
  for v_gift in select * from jsonb_array_elements(coalesce(p_gift_items, '[]'::jsonb)) loop
    v_gift_variant := (v_gift->>'brand_variant_id')::uuid;
    v_gift_qty     := (v_gift->>'qty')::numeric;
    if v_gift_variant is null or v_gift_qty is null or v_gift_qty <= 0 then
      continue;
    end if;
    select item_name, sku into v_gift_item
      from public.inventory_item_brand_variants where id = v_gift_variant;
    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku,
      qty, unit_price, is_gift
    ) values (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty, 0, true
    );
  end loop;

  -- 4. Inventory dispositions (write_off / restock_as_damaged / send_for_repair)
  if jsonb_typeof(p_dispositions) = 'array' and jsonb_array_length(p_dispositions) > 0 then
    for v_disp in select * from jsonb_array_elements(p_dispositions) loop
      v_disp_line_id  := (v_disp->>'return_line_id')::uuid;
      v_disp_type     := v_disp->>'type';
      v_disp_qty      := (v_disp->>'qty')::numeric;
      v_disp_transfer := nullif(v_disp->>'transfer_id', '')::uuid;

      if v_disp_type = 'write_off' then
        select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes
          into v_return_line
          from public.return_lines rl
          where rl.id = v_disp_line_id;
        if v_return_line.item_name is null then
          raise exception 'rpc_create_partial_replacement: disposition return_line % not found', v_disp_line_id;
        end if;

        v_disp_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

        insert into public.inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) values (
          p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
          v_disp_cost,
          'return', p_return_id,
          coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
        ) returning id into v_mov_id;

        perform public._record_inventory_disposition(
          p_return_line_id              => v_disp_line_id,
          p_disposition_type            => 'write_off',
          p_qty                         => v_disp_qty,
          p_inventory_stock_movement_id => v_mov_id
        );

      elsif v_disp_type = 'restock_as_damaged' then
        raise exception 'rpc_create_partial_replacement: disposition type restock_as_damaged is not yet implemented (Phase 8)';

      elsif v_disp_type = 'send_for_repair' then
        raise exception 'rpc_create_partial_replacement: disposition type send_for_repair is not yet implemented (Phase 9)';

      else
        raise exception 'rpc_create_partial_replacement: unknown disposition type %', v_disp_type;
      end if;
    end loop;
  end if;

  perform public._maybe_close_return(p_return_id);
  return v_delivery_id;
end;
$$;

grant execute on function public.rpc_create_partial_replacement(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ─── 5. Cleanup: fix cost on existing dispositions + drop orphan markers ─

-- 5a. Stamp FIFO cost on existing zero-cost movements linked to dispositions.
update public.inventory_stock_movements m
  set unit_cost = public._return_line_fifo_unit_cost(
                    d_line.return_id, d.return_line_id, d.qty
                  )
  from public.return_line_inventory_dispositions d
  join public.return_lines d_line on d_line.id = d.return_line_id
  where m.id = d.inventory_stock_movement_id
    and m.movement_type = 'sale_return_damaged'
    and coalesce(m.unit_cost, 0) = 0;

-- 5b. Delete orphan restock-time markers — sale_return_damaged movements that
-- have no matching disposition row pointing at them. These were written by the
-- Phase 6 rpc_process_return_restock damaged branch and are now redundant with
-- the disposition-owned rows.
delete from public.inventory_stock_movements m
  where m.movement_type = 'sale_return_damaged'
    and not exists (
      select 1 from public.return_line_inventory_dispositions d
      where d.inventory_stock_movement_id = m.id
    );
