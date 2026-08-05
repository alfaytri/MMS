-- Phase 7 — Interim bridge trigger between the legacy single-ledger table
-- and the new dual-ledger tables.
--
-- Sub-task 7.1 installed new tables (return_line_customer_resolutions +
-- return_line_inventory_dispositions) and swapped the progress views to read
-- from them. But the Phase 6 action RPCs
-- (rpc_record_return_refund / rpc_record_return_store_credit /
--  rpc_create_partial_replacement / rpc_write_off_return_damaged) still
-- funnel every ledger write through _record_return_line_resolution, which
-- inserts into the legacy return_line_resolutions table. Between 7.1 and 7.2
-- that leaves post-migration writes invisible to the ledger UI — the toast
-- fires "Refund recorded" but the summary still shows the pre-refund state.
--
-- This trigger mirrors every new legacy row into whichever new-ledger table
-- matches the resolution_type. It runs AFTER INSERT so the legacy constraint
-- checks still fire first. Backfilled rows in the new tables are unaffected
-- because they were inserted directly by 20260730000100, not via the legacy
-- table, so no double-count risk.
--
-- Drop this trigger in Sub-task 7.2 once the action RPCs write to the new
-- tables directly.

create or replace function public._bridge_legacy_resolution_to_dual_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolution_type in ('refund', 'store_credit', 'replacement') then
    insert into public.return_line_customer_resolutions (
      return_line_id,
      resolution_type,
      qty,
      sale_delivery_id,
      credit_note_id,
      notes,
      created_at,
      created_by
    ) values (
      new.return_line_id,
      new.resolution_type,
      new.qty,
      new.sale_delivery_id,
      new.credit_note_id,
      new.notes,
      new.created_at,
      new.created_by
    );
  elsif new.resolution_type = 'write_off' then
    insert into public.return_line_inventory_dispositions (
      return_line_id,
      disposition_type,
      qty,
      inventory_stock_movement_id,
      warehouse_transfer_id,
      notes,
      created_at,
      created_by
    ) values (
      new.return_line_id,
      'write_off',
      new.qty,
      new.inventory_stock_movement_id,
      null,
      new.notes,
      new.created_at,
      new.created_by
    );
  end if;

  return new;
end;
$$;

revoke all on function public._bridge_legacy_resolution_to_dual_ledger() from public;

drop trigger if exists trg_bridge_legacy_resolution_to_dual_ledger
  on public.return_line_resolutions;

create trigger trg_bridge_legacy_resolution_to_dual_ledger
  after insert on public.return_line_resolutions
  for each row
  execute function public._bridge_legacy_resolution_to_dual_ledger();

comment on function public._bridge_legacy_resolution_to_dual_ledger() is
  'Phase 7 interim: mirror every INSERT into return_line_resolutions to the matching new-ledger table (customer_resolutions for refund/replacement/store_credit, inventory_dispositions for write_off). Drop with the trigger in Sub-task 7.2 once action RPCs write to the new tables directly.';
