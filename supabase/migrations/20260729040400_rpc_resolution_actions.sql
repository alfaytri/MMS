-- Phase 6.2: action RPCs on top of the ledger.
--
-- Four public wrappers + one internal closer. All are security definer so
-- they can call rpc_record_return_line_resolution (which is service_role only).
--
-- Public RPCs:
--   rpc_create_partial_replacement(return_id, warehouse_id, lines[], gift_items[])
--   rpc_record_return_refund(return_id, lines[], refund_method?, refund_reference?)
--   rpc_record_return_store_credit(return_id, lines[])
--   rpc_write_off_return_damaged(return_id, warehouse_id) — idempotent
--
-- Internal:
--   _maybe_close_return(return_id) — flips status to resolved_* if fully covered.

-- ─── _maybe_close_return ────────────────────────────────────────────────────

create or replace function public._maybe_close_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_new_status public.return_status;
  v_cn_id uuid;
begin
  select total_remaining into v_remaining
    from public.return_progress
    where return_id = p_return_id;
  if v_remaining is null or v_remaining > 0 then
    return;
  end if;

  v_new_status := public._return_resolution_status(p_return_id);
  if v_new_status is null then
    return;
  end if;

  update public.so_po_returns
    set status = v_new_status, updated_at = now()
    where id = p_return_id
      and status not in (
        'cancelled',
        'resolved_credit',
        'resolved_replacement',
        'resolved_partial'
      );

  -- Best-effort: keep credit_notes.resolution_type in sync with the mix
  -- so the legacy banner path stays coherent for anyone still reading it.
  select credit_note_id into v_cn_id
    from public.so_po_returns where id = p_return_id;
  if v_cn_id is not null then
    update public.credit_notes cn
      set resolution_type = case v_new_status
        when 'resolved_replacement' then 'replacement'::public.credit_note_resolution_type
        when 'resolved_credit'      then 'refund'::public.credit_note_resolution_type
        else null
      end
      where cn.id = v_cn_id;
  end if;
end;
$$;

comment on function public._maybe_close_return is
  'Internal. Flips so_po_returns.status to the derived resolved_* value when total_remaining reaches 0, and stamps credit_notes.resolution_type in lockstep. No-op while remaining > 0.';

-- ─── rpc_create_partial_replacement ────────────────────────────────────────

create or replace function public.rpc_create_partial_replacement(
  p_return_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,          -- [{return_line_id, qty, brand_variant_id?, item_name, sku?}]
  p_gift_items jsonb default '[]'::jsonb
) returns uuid              -- returns the new sale_delivery id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_order_id uuid;
  v_return_status public.return_status;
  v_remaining numeric;
  v_warehouse_name text;
  v_delivery_id uuid;
  v_delivery_number text;
  v_line jsonb;
  v_gift jsonb;
  v_line_count int := 0;
begin
  -- Guard: return exists, is in a resolvable state, and has remaining qty.
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
  select total_remaining into v_remaining from public.return_progress where return_id = p_return_id;
  if coalesce(v_remaining, 0) <= 0 then
    raise exception 'rpc_create_partial_replacement: return % has no remaining qty to resolve', p_return_id;
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

  -- Insert one sale_delivery_line + one ledger row per requested return_line.
  -- Recorder RPC validates qty <= remaining_qty for each line.
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

    perform public.rpc_record_return_line_resolution(
      p_return_line_id := (v_line->>'return_line_id')::uuid,
      p_resolution_type := 'replacement',
      p_qty := (v_line->>'qty')::numeric,
      p_sale_delivery_id := v_delivery_id
    );
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then
    raise exception 'rpc_create_partial_replacement: no lines processed';
  end if;

  -- Gift items land on the delivery but not on the ledger — they don't
  -- resolve returned units.
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

  perform public._maybe_close_return(p_return_id);
  return v_delivery_id;
end;
$$;

grant execute on function public.rpc_create_partial_replacement(uuid, uuid, jsonb, jsonb)
  to authenticated, service_role;

comment on function public.rpc_create_partial_replacement is
  'Atomic replacement: creates one sale_deliveries(type=replacement) row + sale_delivery_lines + one return_line_resolutions row per input line, then closes the return if fully covered. Replaces the client-side sequence in useCreateReplacementDelivery.';

-- ─── rpc_record_return_refund ──────────────────────────────────────────────

create or replace function public.rpc_record_return_refund(
  p_return_id uuid,
  p_lines jsonb,               -- [{return_line_id, qty}]
  p_refund_method text default null,
  p_refund_reference text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cn_id uuid;
  v_line jsonb;
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
    perform public.rpc_record_return_line_resolution(
      p_return_line_id := (v_line->>'return_line_id')::uuid,
      p_resolution_type := 'refund',
      p_qty := (v_line->>'qty')::numeric,
      p_credit_note_id := v_cn_id
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

-- ─── rpc_record_return_store_credit ────────────────────────────────────────

create or replace function public.rpc_record_return_store_credit(
  p_return_id uuid,
  p_lines jsonb                -- [{return_line_id, qty}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cn_id uuid;
  v_line jsonb;
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
    perform public.rpc_record_return_line_resolution(
      p_return_line_id := (v_line->>'return_line_id')::uuid,
      p_resolution_type := 'store_credit',
      p_qty := (v_line->>'qty')::numeric,
      p_credit_note_id := v_cn_id
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

-- ─── rpc_write_off_return_damaged ──────────────────────────────────────────

create or replace function public.rpc_write_off_return_damaged(
  p_return_id uuid,
  p_warehouse_id uuid
) returns int                    -- number of lines written off this call
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_mov_id uuid;
  v_count int := 0;
begin
  if not exists (
    select 1 from public.so_po_returns where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_write_off_return_damaged: return % not found', p_return_id;
  end if;

  for v_line in
    select rl.id, rl.brand_variant_id, rl.item_name, rl.sku,
           p.remaining_qty, rl.condition_notes
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.return_id = p_return_id
      and rl.condition = 'damaged'
      and p.remaining_qty > 0
  loop
    -- Existing stock_movement_type value 'sale_return_damaged' fits — no
    -- new enum needed. reference_type/reference_id link back to the return.
    insert into public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, reference_type, reference_id, notes
    ) values (
      p_warehouse_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
      'sale_return_damaged'::public.stock_movement_type,
      v_line.remaining_qty::integer,
      'return', p_return_id,
      coalesce(v_line.condition_notes, 'Damaged on customer return — written off')
    ) returning id into v_mov_id;

    perform public.rpc_record_return_line_resolution(
      p_return_line_id := v_line.id,
      p_resolution_type := 'write_off',
      p_qty := v_line.remaining_qty,
      p_inventory_stock_movement_id := v_mov_id
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public._maybe_close_return(p_return_id);
  end if;
  return v_count;
end;
$$;

grant execute on function public.rpc_write_off_return_damaged(uuid, uuid)
  to authenticated, service_role;

comment on function public.rpc_write_off_return_damaged is
  'Idempotent. For each damaged return_line with remaining_qty > 0, inserts an inventory_stock_movements(type=sale_return_damaged) row and a matching return_line_resolutions row. Closes the return if fully covered.';
