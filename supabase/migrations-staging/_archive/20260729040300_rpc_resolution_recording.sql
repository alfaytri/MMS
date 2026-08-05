-- Phase 6.1: core recorder RPC and status-deriver helper.
--
-- rpc_record_return_line_resolution is the ONLY function that writes to
-- return_line_resolutions. It validates qty <= remaining, writes one row.
-- It is invoked only by higher-level action wrappers (Sub-task 6.2).
-- Direct execute is denied to authenticated; the wrappers use security definer.
--
-- _return_resolution_status derives the terminal so_po_returns.status from
-- the ledger mix. Used by _maybe_close_return in Sub-task 6.2.

create or replace function public._return_resolution_status(p_return_id uuid)
returns public.return_status
language sql
stable
security definer
set search_path = public
as $$
  with mix as (
    select res.resolution_type
    from public.return_lines rl
    join public.return_line_resolutions res on res.return_line_id = rl.id
    where rl.return_id = p_return_id
  ),
  agg as (
    select
      count(*) as total_rows,
      count(distinct resolution_type) as distinct_types,
      bool_and(resolution_type = 'replacement') as all_replacement,
      bool_and(resolution_type in ('refund','store_credit')) as all_credit,
      bool_and(resolution_type = 'write_off') as all_write_off
    from mix
  )
  select case
    when total_rows = 0        then null                                          -- nothing resolved
    when all_replacement       then 'resolved_replacement'::public.return_status
    when all_credit            then 'resolved_credit'::public.return_status
    when all_write_off         then 'resolved_credit'::public.return_status       -- pure write-off = no customer resolution; treat as credit-side
    else                            'resolved_partial'::public.return_status
  end
  from agg;
$$;

comment on function public._return_resolution_status is
  'Derives the terminal so_po_returns.status from the ledger mix. NULL if the return has no resolution rows yet.';

create or replace function public.rpc_record_return_line_resolution(
  p_return_line_id uuid,
  p_resolution_type text,
  p_qty numeric,
  p_sale_delivery_id uuid default null,
  p_credit_note_id uuid default null,
  p_inventory_stock_movement_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_new_id uuid;
begin
  if p_resolution_type not in ('replacement','refund','store_credit','write_off') then
    raise exception 'rpc_record_return_line_resolution: invalid resolution_type %', p_resolution_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'rpc_record_return_line_resolution: qty must be > 0 (got %)', p_qty;
  end if;

  select remaining_qty into v_remaining
    from public.return_line_progress
    where return_line_id = p_return_line_id;
  if v_remaining is null then
    raise exception 'rpc_record_return_line_resolution: return_line % not found', p_return_line_id;
  end if;
  if p_qty > v_remaining then
    raise exception 'rpc_record_return_line_resolution: qty % exceeds remaining % for return_line %',
      p_qty, v_remaining, p_return_line_id;
  end if;

  insert into public.return_line_resolutions (
    return_line_id, resolution_type, qty,
    sale_delivery_id, credit_note_id, inventory_stock_movement_id,
    notes, created_by
  ) values (
    p_return_line_id, p_resolution_type, p_qty,
    p_sale_delivery_id, p_credit_note_id, p_inventory_stock_movement_id,
    p_notes, auth.uid()
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

-- Denied to authenticated / anon — only service_role and future wrapper
-- functions (which are security definer) call this.
revoke execute on function public.rpc_record_return_line_resolution(uuid, text, numeric, uuid, uuid, uuid, text) from public;
grant execute on function public.rpc_record_return_line_resolution(uuid, text, numeric, uuid, uuid, uuid, text) to service_role;

comment on function public.rpc_record_return_line_resolution is
  'Internal ledger recorder. Called only by resolution action wrappers (rpc_create_partial_replacement, rpc_record_return_refund, rpc_record_return_store_credit, rpc_write_off_return_damaged). Validates qty <= remaining_qty. security definer.';
