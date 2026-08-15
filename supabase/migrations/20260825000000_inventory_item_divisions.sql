create table if not exists public.inventory_item_divisions (
  item_id     uuid not null references public.inventory_items(id)      on delete cascade,
  division_id uuid not null references public.company_divisions(id)    on delete cascade,
  category_id uuid          references public.inventory_categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid          references public.user_data(id),
  primary key (item_id, division_id)
);

create index if not exists idx_iid_division on public.inventory_item_divisions(division_id);
create index if not exists idx_iid_category on public.inventory_item_divisions(category_id) where category_id is not null;

alter table public.inventory_item_divisions enable row level security;

create policy iid_select on public.inventory_item_divisions
  for select using (true);
create policy iid_ins on public.inventory_item_divisions
  for insert with check (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_upd on public.inventory_item_divisions
  for update using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_del on public.inventory_item_divisions
  for delete using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));

-- Backfill: every existing share becomes an assignment, filed under the item's
-- current canonical category (so display is identical until an overlay is set).
insert into public.inventory_item_divisions (item_id, division_id, category_id)
select ii.id, d.division_id, ii.category_id
from public.inventory_items ii
cross join lateral unnest(ii.shared_with_division_ids) as d(division_id)
where ii.shared_with_division_ids is not null
  and exists (select 1 from public.company_divisions cd where cd.id = d.division_id)
on conflict (item_id, division_id) do nothing;
