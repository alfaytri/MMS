-- 9.2: repair vendors are a NEW entity, separate from suppliers.
-- Each vendor auto-provisions a virtual warehouse row so send_for_repair
-- becomes a normal warehouse_transfer against a real warehouse_id target.

alter table public.warehouses
  add column if not exists is_virtual        boolean not null default false,
  add column if not exists repair_vendor_id  uuid;

create table public.repair_vendors (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  address               text,
  notes                 text,
  virtual_warehouse_id  uuid references public.warehouses(id) on delete restrict,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.user_data(id) on delete set null,
  constraint repair_vendors_name_uq unique (name)
);

alter table public.warehouses
  add constraint warehouses_repair_vendor_fk
  foreign key (repair_vendor_id) references public.repair_vendors(id) on delete restrict;

-- Auto-provision the virtual warehouse row when a repair vendor is inserted.
create or replace function public._repair_vendor_provision_warehouse()
returns trigger language plpgsql as $$
declare
  v_wh_id uuid;
begin
  insert into public.warehouses (name, is_virtual, repair_vendor_id, location)
  values ('Repair: ' || new.name, true, new.id, 'Off-site repair vendor')
  returning id into v_wh_id;

  update public.repair_vendors
     set virtual_warehouse_id = v_wh_id
   where id = new.id;

  return new;
end;
$$;

create trigger trg_repair_vendor_provision_warehouse
after insert on public.repair_vendors
for each row execute function public._repair_vendor_provision_warehouse();

alter table public.repair_vendors enable row level security;
create policy p_rv_read  on public.repair_vendors for select using (auth.role() = 'authenticated');
create policy p_rv_write on public.repair_vendors for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
