-- Phase 6.1: per-line resolution ledger.
--
-- Today the return -> resolution relationship is 1:1 (one CN, one status
-- flip). This leaves no room for:
--   - Partial replacements over time (some now, some later)
--   - Split resolutions on the same return (7 replaced + 2 store credit)
--   - Damaged units getting an audit link to their inventory write-off
--
-- return_line_resolutions is a per-action ledger. Every resolution action
-- (replacement delivery, refund CN row, store-credit CN row, damaged
-- write-off inventory movement) writes one or more rows here. A return
-- closes automatically when sum(qty) across a line's ledger rows equals
-- the returned qty. All writes go through security-definer RPCs; no
-- client policy grants insert/update/delete.

create table public.return_line_resolutions (
  id                            uuid primary key default gen_random_uuid(),
  return_line_id                uuid not null references public.return_lines(id) on delete cascade,
  resolution_type               text not null check (resolution_type in ('replacement','refund','store_credit','write_off')),
  qty                           numeric not null check (qty > 0),
  sale_delivery_id              uuid references public.sale_deliveries(id) on delete set null,
  credit_note_id                uuid references public.credit_notes(id) on delete set null,
  inventory_stock_movement_id   uuid references public.inventory_stock_movements(id) on delete set null,
  notes                         text,
  created_at                    timestamptz not null default now(),
  created_by                    uuid,
  -- Link column must match resolution_type: replacement -> sale_delivery_id,
  -- refund/store_credit -> credit_note_id, write_off -> inventory_stock_movement_id.
  constraint return_line_resolutions_link_matches_type check (
    case resolution_type
      when 'replacement'  then sale_delivery_id is not null and credit_note_id is null and inventory_stock_movement_id is null
      when 'refund'       then sale_delivery_id is null and credit_note_id is not null and inventory_stock_movement_id is null
      when 'store_credit' then sale_delivery_id is null and credit_note_id is not null and inventory_stock_movement_id is null
      when 'write_off'    then sale_delivery_id is null and credit_note_id is null and inventory_stock_movement_id is not null
    end
  )
);

create index return_line_resolutions_return_line_idx
  on public.return_line_resolutions(return_line_id);
create index return_line_resolutions_sale_delivery_idx
  on public.return_line_resolutions(sale_delivery_id) where sale_delivery_id is not null;
create index return_line_resolutions_credit_note_idx
  on public.return_line_resolutions(credit_note_id) where credit_note_id is not null;
create index return_line_resolutions_inventory_movement_idx
  on public.return_line_resolutions(inventory_stock_movement_id) where inventory_stock_movement_id is not null;

alter table public.return_line_resolutions enable row level security;

-- Read: any authenticated user (mirrors the read policies on so_po_returns / return_lines).
create policy return_line_resolutions_select
  on public.return_line_resolutions
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies — all writes gated through
-- security-definer RPCs (rpc_record_return_line_resolution +
-- the action wrappers in Sub-task 6.2).

comment on table public.return_line_resolutions is
  'Per-line resolution audit trail. One row per resolution action (replacement / refund / store_credit / write_off). Return closes when sum(qty) reaches returned qty across all lines.';
