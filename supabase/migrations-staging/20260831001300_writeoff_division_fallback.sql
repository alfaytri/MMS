-- 20260831001300_writeoff_division_fallback.sql
-- Phase 3a fix: rpc_record_inventory_disposition write_off could not resolve a
-- destination sub-container division for the common case of a sale return whose
-- own division_id is NULL (the create-return flow does not stamp it). On a real
-- (non-virtual) warehouse _find_or_create_sub_container then raises
-- "division_id required", so NO write-off could be recorded — the P&L hole this
-- phase set out to close stayed open for damaged write-offs on real returns.
--
-- Fix: resolve the division with a fallback to the source sale order's division
-- (identical to the coalesce(return, sale_order) pattern rpc_create_partial_
-- replacement already ships), and raise a clear, actionable error if it still
-- can't be resolved. This fixes every existing division-less return with no data
-- backfill. Restock_as_damaged already worked (writes nullable-division damaged
-- stock, no sub-container creation); the good-restock path is untouched.
--
-- Body sourced verbatim from the live staging function (pg_get_functiondef,
-- 2026-08-30); ONLY the write_off division-resolution block changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_record_inventory_disposition(p_return_id uuid, p_warehouse_id uuid, p_dispositions jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disp         jsonb;
  v_disp_line_id uuid;
  v_disp_type    text;
  v_disp_qty     numeric;
  v_return_line  record;
  v_mov_id       uuid;
  v_unit_cost    numeric;
  v_count        int := 0;
  v_disp_id      uuid;
  v_return_div   uuid;
  v_sub          uuid;
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

      -- Phase 3a: resolve the return division + a destination sub-container.
      -- inventory_stock_movements.sub_container_id is NOT NULL; the previous insert
      -- omitted it and broke on a schema drift, so no write-off could be recorded.
      -- Sale returns are commonly created with a NULL division_id, so fall back to
      -- the source sale order's division (mirrors rpc_create_partial_replacement).
      -- On a real (non-virtual) warehouse a NULL division is rejected by
      -- _enforce_sub_container_division_rule, so resolve it before creating the sub.
      select coalesce(r.division_id, so.division_id)
        into v_return_div
        from public.so_po_returns r
        left join public.sale_orders so
          on so.id = r.source_id and r.source_type = 'sale_order'
        where r.id = p_return_id;
      if v_return_div is null then
        raise exception 'rpc_record_inventory_disposition: write_off cannot resolve division from return or sale order for warehouse %.', p_warehouse_id
          using hint = 'Set division_id on the return or its sale order before writing off.';
      end if;
      v_sub := public._find_or_create_sub_container(p_warehouse_id, v_return_div);

      insert into public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_sub, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
        v_unit_cost,
        'return', p_return_id,
        coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
      ) returning id into v_mov_id;

      select public._record_inventory_disposition(
        p_return_line_id              => v_disp_line_id,
        p_disposition_type            => 'write_off',
        p_qty                         => v_disp_qty,
        p_inventory_stock_movement_id => v_mov_id
      ) into v_disp_id;

      -- Phase 3a: emit the damaged_write_off movement the P&L Scrap line reads
      -- (only a P&L-invisible sale_return_damaged stock movement was written
      -- before), and reverse the sale COGS (full-line reversal — cost -> scrap).
      insert into public.inventory_damaged_movements (
        movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
        source_return_line_disposition_id, notes, created_by, division_id
      ) values (
        'damaged_write_off', v_disp_qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
        v_disp_id, coalesce(v_return_line.condition_notes, 'Written off on customer return'),
        public._current_user_data_id(), v_return_div
      );
      perform public._reverse_sale_cogs_for_return(p_return_id, v_return_line.brand_variant_id, v_disp_qty);

    elsif v_disp_type = 'restock_as_damaged' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'restock_as_damaged',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    elsif v_disp_type = 'send_for_repair' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'send_for_repair',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

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
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
