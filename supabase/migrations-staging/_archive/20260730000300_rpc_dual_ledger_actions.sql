-- Phase 7 — Sub-task 7.2: rewritten action wrappers on top of the dual
-- ledger. External signatures stay the same as Phase 6 except:
--   1) rpc_create_partial_replacement gains a p_dispositions jsonb param
--      (with default '[]') for per-damaged-line disposition decisions.
--   2) New public rpc_record_inventory_disposition(p_return_id,
--      p_warehouse_id, p_dispositions) for after-the-fact inventory
--      dispositioning.
--   3) rpc_write_off_return_damaged reduces to a thin backward-compat
--      wrapper that fetches remaining damaged qty per line and delegates
--      to rpc_record_inventory_disposition with type='write_off' entries.
--
-- All wrappers are SECURITY DEFINER, search_path = public. Internal writes
-- go through the recorders in 20260730000200 (customer + inventory), which
-- are service_role-only. The wrappers' SECURITY DEFINER context propagates
-- the elevated privilege down to the recorders.

-- ─── rpc_create_partial_replacement ──────────────────────────────────────
-- Phase 6 signature: (p_return_id, p_warehouse_id, p_lines, p_gift_items)
-- Phase 7 signature: adds p_dispositions jsonb default '[]'::jsonb
--
-- DROP old signature first — CREATE OR REPLACE alone won't replace a
-- function whose argument list changed; it would create a second overload
-- and calls with the Phase 6 param list would still resolve to the old
-- body.

drop function if exists public.rpc_create_partial_replacement(uuid, uuid, jsonb, jsonb);

create or replace function public.rpc_create_partial_replacement(
  p_return_id     uuid,
  p_warehouse_id  uuid,
  p_lines         jsonb,          -- [{return_line_id, qty, brand_variant_id?, item_name, sku?}]
  p_gift_items    jsonb default '[]'::jsonb,
  p_dispositions  jsonb default '[]'::jsonb  -- [{return_line_id, type, qty, transfer_id?}]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_order_id   uuid;
  v_return_status   public.return_status;
  v_customer_rem    numeric;
  v_warehouse_name  text;
  v_delivery_id     uuid;
  v_delivery_number text;
  v_line            jsonb;
  v_gift            jsonb;
  v_disp            jsonb;
  v_line_count      int := 0;
  v_disp_type       text;
  v_disp_qty        numeric;
  v_disp_line_id    uuid;
  v_disp_transfer   uuid;
  v_return_line     record;
  v_mov_id          uuid;
begin
  -- Guard: return exists, is in a resolvable state, has remaining customer qty.
  select r.source_id, r.status into v_sale_order_id, v_return_status
    from public.so_po_returns r
    where r.id = p_return_id
      and r.source_type = 'sale_order'
      and r.deleted_at is null;
  if v_sale_order_id is null then
    raise exception 'rpc_create_partial_replacement: return % not found', p_return_id;
  end if;
  if v_return_status not in (
    'restocked', 'resolved_credit', 'resolved_replacement', 'resolved_partial'
  ) then
    raise exception 'rpc_create_partial_replacement: return % is in status % (must be restocked or partially resolved)',
      p_return_id, v_return_status;
  end if;
  select customer_remaining into v_customer_rem from public.return_progress where return_id = p_return_id;
  if coalesce(v_customer_rem, 0) <= 0 then
    raise exception 'rpc_create_partial_replacement: return % has no remaining customer qty to resolve', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_create_partial_replacement: p_lines must be a non-empty array';
  end if;

  select name into v_warehouse_name from public.warehouses where id = p_warehouse_id;
  if v_warehouse_name is null then
    raise exception 'rpc_create_partial_replacement: warehouse % not found', p_warehouse_id;
  end if;

  v_delivery_number := public.next_delivery_number();

  insert into public.sale_deliveries (
    delivery_number, sale_order_id, warehouse_id, warehouse_name, date, status, type, return_id
  ) values (
    v_delivery_number, v_sale_order_id, p_warehouse_id, v_warehouse_name,
    current_date, 'pending', 'replacement', p_return_id
  ) returning id into v_delivery_id;

  -- One sale_delivery_line + one customer_resolution row per requested return_line.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_delivery_id,
      nullif(v_line->>'brand_variant_id', '')::uuid,
      v_line->>'item_name',
      v_line->>'sku',
      (v_line->>'qty')::numeric
    );

    perform public._record_customer_resolution(
      p_return_line_id   => (v_line->>'return_line_id')::uuid,
      p_resolution_type  => 'replacement',
      p_qty              => (v_line->>'qty')::numeric,
      p_sale_delivery_id => v_delivery_id
    );
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then
    raise exception 'rpc_create_partial_replacement: no lines processed';
  end if;

  -- Gift items land on the delivery but not on the ledger.
  if jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 then
    for v_gift in select * from jsonb_array_elements(p_gift_items) loop
      insert into public.sale_delivery_lines (
        sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
      ) values (
        v_delivery_id,
        nullif(v_gift->>'brand_variant_id', '')::uuid,
        v_gift->>'item_name',
        v_gift->>'sku',
        (v_gift->>'qty')::numeric
      );
    end loop;
  end if;

  -- Optional inventory dispositions for damaged rows on this same call.
  -- Atomic with the delivery — if any disposition raises, the whole
  -- transaction rolls back.
  if jsonb_array_length(coalesce(p_dispositions, '[]'::jsonb)) > 0 then
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

        insert into public.inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, reference_type, reference_id, notes
        ) values (
          p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
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

comment on function public.rpc_create_partial_replacement is
  'Atomic replacement + optional inventory disposition. Creates one sale_deliveries(type=replacement) + sale_delivery_lines + customer_resolution rows for p_lines; if p_dispositions is non-empty, also books inventory_stock_movements + inventory_disposition rows for each damaged unit in the same transaction. Closes the return via _maybe_close_return when both dimensions cover.';

-- ─── rpc_record_return_refund ────────────────────────────────────────────

create or replace function public.rpc_record_return_refund(
  p_return_id        uuid,
  p_lines            jsonb,          -- [{return_line_id, qty}]
  p_refund_method    text default null,
  p_refund_reference text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_refund: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_refund: p_lines must be a non-empty array';
  end if;

  if p_refund_method is not null or p_refund_reference is not null then
    update public.credit_notes
      set refund_method = coalesce(p_refund_method, refund_method),
          refund_reference = coalesce(p_refund_reference, refund_reference)
      where id = v_cn_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'refund',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_refund: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$$;

grant execute on function public.rpc_record_return_refund(uuid, jsonb, text, text)
  to authenticated, service_role;

-- ─── rpc_record_return_store_credit ──────────────────────────────────────

create or replace function public.rpc_record_return_store_credit(
  p_return_id uuid,
  p_lines     jsonb                  -- [{return_line_id, qty}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cn_id uuid;
  v_line  jsonb;
  v_count int := 0;
begin
  select credit_note_id into v_cn_id
    from public.so_po_returns
    where id = p_return_id and deleted_at is null;
  if v_cn_id is null then
    raise exception 'rpc_record_return_store_credit: return % has no linked credit note', p_return_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'rpc_record_return_store_credit: p_lines must be a non-empty array';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public._record_customer_resolution(
      p_return_line_id  => (v_line->>'return_line_id')::uuid,
      p_resolution_type => 'store_credit',
      p_qty             => (v_line->>'qty')::numeric,
      p_credit_note_id  => v_cn_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'rpc_record_return_store_credit: no lines processed';
  end if;

  perform public._maybe_close_return(p_return_id);
end;
$$;

grant execute on function public.rpc_record_return_store_credit(uuid, jsonb)
  to authenticated, service_role;

-- ─── rpc_record_inventory_disposition (NEW) ──────────────────────────────
-- Dedicated after-the-fact inventory disposition for damaged returns.
-- Accepts a jsonb array of {return_line_id, type, qty[, transfer_id]} rows;
-- for each, books the appropriate inventory movement (write_off for now)
-- and records an inventory_dispositions row. Closes the return if both
-- ledgers reach 0 as a side effect.

create or replace function public.rpc_record_inventory_disposition(
  p_return_id     uuid,
  p_warehouse_id  uuid,
  p_dispositions  jsonb            -- [{return_line_id, type, qty, transfer_id?}]
) returns int                      -- number of dispositions processed
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

      insert into public.inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
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
  'After-the-fact inventory disposition for damaged returns. Iterates p_dispositions and books an inventory_stock_movements row + inventory_dispositions ledger row for each. Phase 7 supports only type=write_off; restock_as_damaged (Phase 8) and send_for_repair (Phase 9) raise "not yet implemented". Closes the return if both ledgers cover.';

-- ─── rpc_write_off_return_damaged (thin wrapper) ─────────────────────────
-- Backward-compat: fetches remaining damaged qty per line, builds a
-- write_off disposition array, delegates to rpc_record_inventory_disposition.
-- Keeps the Phase 6 useWriteOffDamagedReturn hook working unchanged during
-- transition. A Phase 8 cleanup can retire this wrapper.

create or replace function public.rpc_write_off_return_damaged(
  p_return_id    uuid,
  p_warehouse_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispositions jsonb;
  v_processed    int;
begin
  if not exists (
    select 1 from public.so_po_returns where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_write_off_return_damaged: return % not found', p_return_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'return_line_id', rl.id,
           'type',           'write_off',
           'qty',            p.inventory_remaining_qty
         )), '[]'::jsonb)
    into v_dispositions
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.return_id = p_return_id
      and rl.condition = 'damaged'
      and coalesce(p.inventory_remaining_qty, 0) > 0;

  if jsonb_array_length(v_dispositions) = 0 then
    return 0;
  end if;

  v_processed := public.rpc_record_inventory_disposition(
    p_return_id    => p_return_id,
    p_warehouse_id => p_warehouse_id,
    p_dispositions => v_dispositions
  );
  return v_processed;
end;
$$;

grant execute on function public.rpc_write_off_return_damaged(uuid, uuid)
  to authenticated, service_role;

comment on function public.rpc_write_off_return_damaged is
  'Backward-compat wrapper. Fetches remaining damaged qty per line and delegates to rpc_record_inventory_disposition with type=write_off entries. Kept for the Phase 6 useWriteOffDamagedReturn hook; a Phase 8 cleanup can retire once callers migrate to rpc_record_inventory_disposition directly.';
