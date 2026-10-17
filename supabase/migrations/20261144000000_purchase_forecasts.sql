-- Purchase forecast pipeline (#3, phase 3a). Division-scoped planned-purchase
-- lines that later convert/attach to POs and can seed plan-ahead shipments.
create sequence if not exists public.forecast_number_seq;

create table if not exists public.purchase_forecasts (
  id uuid primary key default gen_random_uuid(),
  forecast_number text unique,
  division_id uuid not null,
  brand_variant_id uuid references public.inventory_item_brand_variants(id),
  item_name text,
  sku text,
  qty numeric not null check (qty > 0),
  supplier_id uuid references public.suppliers(id),
  supplier_name text,
  currency text not null default 'QAR',
  est_value numeric,
  planned_order_date date,
  needed_by_date date,
  engagement text not null default 'not_started'
    check (engagement in ('not_started','in_discussion','quotation_received','negotiating','ready_to_order','on_hold')),
  status text not null default 'open'
    check (status in ('open','ordered','cancelled')),
  po_id uuid references public.purchase_orders(id),
  shipment_id uuid references public.shipments(id),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_forecasts_division on public.purchase_forecasts(division_id);
create index if not exists idx_purchase_forecasts_status on public.purchase_forecasts(status);

create or replace function public.assign_forecast_number() returns trigger
  language plpgsql as $$
begin
  if new.forecast_number is null then
    new.forecast_number := 'FC-' || lpad(nextval('public.forecast_number_seq')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_assign_forecast_number on public.purchase_forecasts;
create trigger trg_assign_forecast_number before insert on public.purchase_forecasts
  for each row execute function public.assign_forecast_number();

create or replace function public.set_updated_at_purchase_forecasts() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_set_updated_at_purchase_forecasts on public.purchase_forecasts;
create trigger trg_set_updated_at_purchase_forecasts before update on public.purchase_forecasts
  for each row execute function public.set_updated_at_purchase_forecasts();

alter table public.purchase_forecasts enable row level security;
drop policy if exists purchase_forecasts_rw on public.purchase_forecasts;
create policy purchase_forecasts_rw on public.purchase_forecasts
  for all using (public.is_division_visible(division_id))
  with check (public.is_division_visible(division_id));
