-- 9.2b: extend warehouse_transfers so it can carry the damaged-repair flow.
-- We reuse the existing table rather than creating a parallel one; the
-- transfer_kind column is the discriminator.
alter table public.warehouse_transfers
  add column if not exists transfer_kind                     text not null default 'good_stock',
  add column if not exists repair_vendor_id                  uuid references public.repair_vendors(id) on delete restrict,
  add column if not exists source_return_line_disposition_id uuid references public.return_line_inventory_dispositions(id) on delete set null,
  add column if not exists expected_return_date              date,
  add column if not exists repair_cost                       numeric check (repair_cost is null or repair_cost >= 0);

alter table public.warehouse_transfers
  add constraint warehouse_transfers_kind_check
  check (transfer_kind in ('good_stock','damaged_repair_out','damaged_repair_return_good','damaged_repair_return_writeoff'));

-- A damaged-repair-out transfer MUST link to a disposition + a repair vendor;
-- a return-from-repair transfer MUST link to a repair vendor.
alter table public.warehouse_transfers
  add constraint warehouse_transfers_repair_shape check (
    case transfer_kind
      when 'good_stock' then repair_vendor_id is null
                         and source_return_line_disposition_id is null
      when 'damaged_repair_out' then repair_vendor_id is not null
                         and source_return_line_disposition_id is not null
      when 'damaged_repair_return_good'     then repair_vendor_id is not null
      when 'damaged_repair_return_writeoff' then repair_vendor_id is not null
    end
  );

create index if not exists idx_wt_transfer_kind on public.warehouse_transfers (transfer_kind);
create index if not exists idx_wt_repair_vendor on public.warehouse_transfers (repair_vendor_id);
