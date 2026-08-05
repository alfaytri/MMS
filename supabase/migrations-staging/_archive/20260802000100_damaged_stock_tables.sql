-- 9.1: damaged stock lives in its own tables, parallel to inventory_stock.
-- Rationale: A2 (dedicated) chosen over A1 (condition flag) to keep the
-- blast radius zero on existing sale/delivery/picker queries.

create table public.inventory_damaged_stock (
  warehouse_id       uuid not null references public.warehouses(id) on delete restrict,
  brand_variant_id   uuid not null references public.inventory_item_brand_variants(id) on delete restrict,
  qty                numeric not null default 0 check (qty >= 0),
  weighted_unit_cost numeric not null default 0 check (weighted_unit_cost >= 0),
  updated_at         timestamptz not null default now(),
  primary key (warehouse_id, brand_variant_id)
);

create table public.inventory_damaged_stock_layers (
  id                     uuid primary key default gen_random_uuid(),
  warehouse_id           uuid not null references public.warehouses(id) on delete restrict,
  brand_variant_id       uuid not null references public.inventory_item_brand_variants(id) on delete restrict,
  qty_received           numeric not null check (qty_received > 0),
  qty_remaining          numeric not null check (qty_remaining >= 0),
  unit_cost              numeric not null check (unit_cost >= 0),
  source_return_line_id  uuid references public.return_lines(id) on delete set null,
  layered_at             timestamptz not null default now(),
  created_by             uuid references public.user_data(id) on delete set null
);
create index idx_idsl_wh_variant on public.inventory_damaged_stock_layers (warehouse_id, brand_variant_id, layered_at);

create table public.inventory_damaged_movements (
  id                                  uuid primary key default gen_random_uuid(),
  movement_type                       text not null check (movement_type in (
    'restock_as_damaged_in',
    'send_for_repair_out',
    'return_from_repair_as_writeoff',
    'damaged_write_off',
    'damaged_adjust'
  )),
  qty                                 numeric not null check (qty > 0),
  warehouse_id                        uuid not null references public.warehouses(id) on delete restrict,
  brand_variant_id                    uuid not null references public.inventory_item_brand_variants(id) on delete restrict,
  unit_cost                           numeric not null default 0,
  source_return_line_disposition_id   uuid references public.return_line_inventory_dispositions(id) on delete set null,
  source_transfer_id                  uuid references public.warehouse_transfers(id) on delete set null,
  notes                               text,
  created_at                          timestamptz not null default now(),
  created_by                          uuid references public.user_data(id) on delete set null
);
create index idx_idm_wh_variant_time on public.inventory_damaged_movements (warehouse_id, brand_variant_id, created_at);
create index idx_idm_source_disp on public.inventory_damaged_movements (source_return_line_disposition_id);
create index idx_idm_source_transfer on public.inventory_damaged_movements (source_transfer_id);

-- RLS: same shape as inventory_stock. Read visible to everyone authenticated;
-- writes limited to authenticated (RPCs run as SECURITY DEFINER anyway).
alter table public.inventory_damaged_stock          enable row level security;
alter table public.inventory_damaged_stock_layers   enable row level security;
alter table public.inventory_damaged_movements      enable row level security;

create policy p_ids_read on public.inventory_damaged_stock        for select using (auth.role() = 'authenticated');
create policy p_idsl_read on public.inventory_damaged_stock_layers for select using (auth.role() = 'authenticated');
create policy p_idm_read on public.inventory_damaged_movements     for select using (auth.role() = 'authenticated');
