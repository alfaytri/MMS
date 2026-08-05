-- Phase 8 Sub-task 8.7 sub-fix (follow-up to 20260731000600): the previous
-- fix corrected the sale_deliveries / sale_delivery_lines INSERTs, but the
-- SELECT that populates v_return_line still reads rl.unit_price, and
-- return_lines has no unit_price column (verified against the table
-- definition in 20260715160000_normalize_remaining_json_columns.sql — the
-- table has qty, condition, condition_notes but no price fields at all).
--
-- The value was never consumed after 000600 dropped unit_price from the
-- sale_delivery_lines INSERT. Removing the column from the SELECT is a pure
-- no-op on runtime semantics.

create or replace function public.rpc_create_partial_replacement(
  p_return_id      uuid,
  p_warehouse_id   uuid,
  p_lines          jsonb,
  p_gift_items     jsonb default '[]'::jsonb,
  p_dispositions   jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
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
      delivery_number, sale_order_id, warehouse_id, date,
      status, type, return_id
    ) values (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', p_return_id
    ) returning id into v_delivery_id;
  end if;

  -- 2. Iterate replacement lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    if v_line_qty is null or v_line_qty <= 0 then
      continue;
    end if;

    select rl.brand_variant_id, rl.item_name, rl.sku
      into v_return_line
      from public.return_lines rl
      where rl.id = v_line_id and rl.return_id = p_return_id;
    if v_return_line.item_name is null then
      raise exception 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    end if;

    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty::integer
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
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty::integer
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
$function$;
