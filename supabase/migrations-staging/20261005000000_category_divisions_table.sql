-- 20261005000000_category_divisions_table.sql
create table if not exists public.inventory_category_divisions (
  category_id uuid not null references public.inventory_categories(id) on delete cascade,
  division_id uuid not null references public.company_divisions(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.user_data(id),
  primary key (category_id, division_id)
);
create index if not exists idx_icd_division on public.inventory_category_divisions(division_id);

alter table public.inventory_category_divisions enable row level security;

-- Reads: any authenticated user (the catalog is global).
drop policy if exists icd_select on public.inventory_category_divisions;
create policy icd_select on public.inventory_category_divisions
  for select to authenticated using (true);
-- No INSERT/UPDATE/DELETE policy on purpose → direct writes are denied;
-- all writes go through the SECURITY DEFINER RPCs (Task 4).

grant select on public.inventory_category_divisions to authenticated;
