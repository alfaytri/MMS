-- Phase 7 — Sub-task 7.2: internal recorders + rewritten close/status helpers.
--
-- Replaces the single-ledger recorder rpc_record_return_line_resolution
-- (still around for the interim bridge trigger; drop in Phase 8) with two
-- dimension-scoped recorders — one per new-ledger table. All app writes
-- must funnel through the higher-level action wrappers in the companion
-- migration (20260730000300); the recorders are internal and locked down
-- to service_role only.
--
-- _maybe_close_return now requires BOTH customer_remaining AND inventory_
-- remaining to reach 0 before flipping the return terminal.
-- _return_resolution_status reads only the customer ledger — the inventory
-- dimension is audit-side and doesn't factor into customer-facing status.

-- ─── _record_customer_resolution ─────────────────────────────────────────

create or replace function public._record_customer_resolution(
  p_return_line_id   uuid,
  p_resolution_type  text,
  p_qty              numeric,
  p_sale_delivery_id uuid default null,
  p_credit_note_id   uuid default null,
  p_notes            text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_new_id    uuid;
begin
  if p_resolution_type not in ('refund','replacement','store_credit') then
    raise exception '_record_customer_resolution: invalid resolution_type %', p_resolution_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_customer_resolution: qty must be > 0 (got %)', p_qty;
  end if;

  select customer_remaining_qty into v_remaining
    from public.return_line_progress
    where return_line_id = p_return_line_id;
  if v_remaining is null then
    raise exception '_record_customer_resolution: return_line % not found', p_return_line_id;
  end if;
  if p_qty > v_remaining then
    raise exception '_record_customer_resolution: qty % exceeds customer remaining %', p_qty, v_remaining;
  end if;

  insert into public.return_line_customer_resolutions (
    return_line_id, resolution_type, qty,
    sale_delivery_id, credit_note_id, notes, created_by
  ) values (
    p_return_line_id, p_resolution_type, p_qty,
    p_sale_delivery_id, p_credit_note_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public._record_customer_resolution is
  'Internal. Inserts one row in return_line_customer_resolutions after validating qty <= customer_remaining_qty. Called by the action wrappers only (rpc_record_return_refund / rpc_record_return_store_credit / rpc_create_partial_replacement).';

-- ─── _record_inventory_disposition ───────────────────────────────────────

create or replace function public._record_inventory_disposition(
  p_return_line_id              uuid,
  p_disposition_type            text,
  p_qty                         numeric,
  p_inventory_stock_movement_id uuid default null,
  p_warehouse_transfer_id       uuid default null,
  p_notes                       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition text;
  v_remaining numeric;
  v_new_id    uuid;
begin
  if p_disposition_type not in ('write_off','restock_as_damaged','send_for_repair') then
    raise exception '_record_inventory_disposition: invalid disposition_type %', p_disposition_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_inventory_disposition: qty must be > 0 (got %)', p_qty;
  end if;

  select rl.condition, p.inventory_remaining_qty
    into v_condition, v_remaining
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

  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public._record_inventory_disposition is
  'Internal. Inserts one row in return_line_inventory_dispositions after validating (a) return_line is damaged and (b) qty <= inventory_remaining_qty. Called by the action wrappers only.';

revoke execute on function public._record_customer_resolution(uuid,text,numeric,uuid,uuid,text) from public;
revoke execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text) from public;
grant  execute on function public._record_customer_resolution(uuid,text,numeric,uuid,uuid,text) to service_role;
grant  execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text) to service_role;

-- ─── Rewritten _return_resolution_status ─────────────────────────────────
-- Reads ONLY the customer ledger mix. Inventory dispositions don't factor
-- into customer-facing status.

create or replace function public._return_resolution_status(p_return_id uuid)
returns public.return_status
language sql
stable
as $$
  select case
    when count(distinct cr.resolution_type) = 0 then null
    when count(distinct cr.resolution_type) > 1 then 'resolved_partial'::public.return_status
    when bool_and(cr.resolution_type = 'replacement') then 'resolved_replacement'::public.return_status
    when bool_and(cr.resolution_type in ('refund','store_credit')) then 'resolved_credit'::public.return_status
    else 'resolved_partial'::public.return_status
  end
  from public.return_lines rl
  join public.return_line_customer_resolutions cr on cr.return_line_id = rl.id
  where rl.return_id = p_return_id;
$$;

comment on function public._return_resolution_status is
  'Internal. Returns the derived resolved_* status for a return based ONLY on the customer ledger mix. Inventory dispositions are audit-only and do not affect customer-facing status.';

-- ─── Rewritten _maybe_close_return ───────────────────────────────────────
-- Closes ONLY when BOTH customer and inventory ledgers reach 0 remaining.
-- Status is derived from the customer ledger mix — inventory dimension is
-- audit-side, doesn't affect customer-facing status.

create or replace function public._maybe_close_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_remaining  numeric;
  v_inventory_remaining numeric;
  v_new_status          public.return_status;
  v_cn_id               uuid;
begin
  select customer_remaining, inventory_remaining
    into v_customer_remaining, v_inventory_remaining
    from public.return_progress
    where return_id = p_return_id;

  if v_customer_remaining is null or v_customer_remaining > 0 then
    return;  -- customer not fully compensated yet
  end if;
  if coalesce(v_inventory_remaining, 0) > 0 then
    return;  -- damaged units not fully dispositioned yet
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

  -- Keep credit_notes.resolution_type in sync for legacy banner readers.
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
  'Internal. Flips so_po_returns.status to the derived resolved_* value ONLY when BOTH customer_remaining and inventory_remaining reach 0 in return_progress. Stamps credit_notes.resolution_type in lockstep. No-op while either dimension has remaining qty.';
