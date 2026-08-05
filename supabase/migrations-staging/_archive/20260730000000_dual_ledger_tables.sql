-- Phase 7 — Dual-Ledger for Damaged Units.
--
-- Splits return_line_resolutions into two independent ledgers so damaged
-- returns under seller-fault reasons can BOTH compensate the customer AND
-- book the physical unit's disposition on the same return line — which the
-- single-ledger model couldn't represent (rpc_record_return_line_resolution
-- enforced qty ≤ remaining, so a unit could only be recorded once).
--
-- The legacy return_line_resolutions table stays alive during Phase 7 for
-- rollback safety. A follow-up Phase 8 migration can drop it once Phase 7
-- has been in production for a stability window.

-- ─── Customer resolutions ────────────────────────────────────────────────
-- Every returned unit MUST have a customer resolution before the return
-- can close (matches the old ledger semantics for refund / store_credit /
-- replacement). Damaged units are covered here just like good units — the
-- reason (seller-fault vs customer-fault) is an operator judgment call,
-- not a hard rule.

create table public.return_line_customer_resolutions (
  id               uuid primary key default gen_random_uuid(),
  return_line_id   uuid not null references public.return_lines(id) on delete cascade,
  resolution_type  text not null check (resolution_type in ('refund','replacement','store_credit')),
  qty              numeric not null check (qty > 0),
  sale_delivery_id uuid references public.sale_deliveries(id) on delete set null,
  credit_note_id   uuid references public.credit_notes(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  constraint return_line_customer_resolutions_link_matches_type check (
    case resolution_type
      when 'replacement'  then sale_delivery_id is not null and credit_note_id is null
      when 'refund'       then sale_delivery_id is null and credit_note_id is not null
      when 'store_credit' then sale_delivery_id is null and credit_note_id is not null
    end
  )
);
create index on public.return_line_customer_resolutions(return_line_id);
create index on public.return_line_customer_resolutions(sale_delivery_id) where sale_delivery_id is not null;
create index on public.return_line_customer_resolutions(credit_note_id)   where credit_note_id   is not null;

alter table public.return_line_customer_resolutions enable row level security;
create policy "return_line_customer_resolutions_select"
  on public.return_line_customer_resolutions for select
  to authenticated using (true);
-- No client-writable INSERT/UPDATE/DELETE — all writes via security-definer
-- RPCs (see 20260730000200 + 20260730000300 migrations).

comment on table public.return_line_customer_resolutions is
  'Per-return-line customer resolution ledger. Every returned unit must eventually be covered here (refund / replacement / store_credit) for the return to close. Sums to return_lines.qty per line. See Phase 7 plan.';

-- ─── Inventory dispositions ──────────────────────────────────────────────
-- Only relevant for DAMAGED return_lines. Good units are auto-dispositioned
-- by rpc_process_return_restock (they land back in stock via a sale_return
-- movement — no ledger row needed). For damaged units, every unit MUST have
-- an inventory disposition (write_off / restock_as_damaged / send_for_repair)
-- before the return can terminally close.
--
-- Only 'write_off' is fully implemented in Phase 7. The other two disposition_
-- types are schema-supported but the action RPC raises "not yet implemented" —
-- hooks for Phase 8 / 9.

create table public.return_line_inventory_dispositions (
  id                          uuid primary key default gen_random_uuid(),
  return_line_id              uuid not null references public.return_lines(id) on delete cascade,
  disposition_type            text not null check (disposition_type in ('write_off','restock_as_damaged','send_for_repair')),
  qty                         numeric not null check (qty > 0),
  inventory_stock_movement_id uuid references public.inventory_stock_movements(id) on delete set null,
  warehouse_transfer_id       uuid references public.warehouse_transfers(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  created_by                  uuid,
  constraint return_line_inventory_dispositions_link_matches_type check (
    case disposition_type
      when 'write_off'           then inventory_stock_movement_id is not null and warehouse_transfer_id is null
      when 'restock_as_damaged'  then inventory_stock_movement_id is not null and warehouse_transfer_id is null
      when 'send_for_repair'     then warehouse_transfer_id is not null
    end
  )
);
create index on public.return_line_inventory_dispositions(return_line_id);
create index on public.return_line_inventory_dispositions(inventory_stock_movement_id) where inventory_stock_movement_id is not null;
create index on public.return_line_inventory_dispositions(warehouse_transfer_id)       where warehouse_transfer_id       is not null;

alter table public.return_line_inventory_dispositions enable row level security;
create policy "return_line_inventory_dispositions_select"
  on public.return_line_inventory_dispositions for select
  to authenticated using (true);

comment on table public.return_line_inventory_dispositions is
  'Per-return-line inventory disposition ledger for DAMAGED units only. Good units are auto-dispositioned via rpc_process_return_restock. Damaged units must sum to return_lines.qty here before the return can terminally close. See Phase 7 plan.';
