-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase A: additive schema
--
-- Ships:
--   1. New table warehouse_sub_containers (empty).
--   2. Nullable sub_container_id FK on the six stock-carrying tables +
--      two nullable FKs on warehouse_transfers.
--   3. Nullable warehouses.company_id, backfilled deterministically from
--      warehouses.division_id → company_divisions.company_id, then asserted
--      non-null across all existing rows before the migration commits.
--
-- Nothing reads the new columns yet. RLS policies, RPC rewires, NOT NULL
-- promotions, and UI all land in Phases B–E.
--
-- Design spec: docs/warehouse-model-v2-design.md
-- Prior migration: 20260802000700_damaged_transfers_division_id_backfill.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1. New table ────────────────────────────────────────────────────────
create table public.warehouse_sub_containers (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id)         on delete restrict,
  division_id  uuid not null references public.company_divisions(id)  on delete restrict,
  name         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.user_data(id) on delete set null,
  constraint warehouse_sub_containers_warehouse_name_uniq unique (warehouse_id, name)
);

create index idx_wsc_warehouse on public.warehouse_sub_containers(warehouse_id);
create index idx_wsc_division  on public.warehouse_sub_containers(division_id);
create index idx_wsc_wh_div    on public.warehouse_sub_containers(warehouse_id, division_id);

comment on table public.warehouse_sub_containers is
  'Per-division stock partition inside a warehouse. Phase A ships the table empty; Phase B auto-creates one per (warehouse, division) pair; Phase C makes stock rows require it.';

-- 2. Nullable FK columns on stock-carrying tables ─────────────────────
alter table public.fifo_cost_layers
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

alter table public.inventory_stock_movements
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

alter table public.warehouse_stock_allocations
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

alter table public.stock_adjustments
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

alter table public.receival_items
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

alter table public.warehouse_transfer_items
  add column sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict;

-- warehouse_transfers gets TWO: source + destination sub-container.
alter table public.warehouse_transfers
  add column from_sub_container_id uuid references public.warehouse_sub_containers(id) on delete restrict,
  add column to_sub_container_id   uuid references public.warehouse_sub_containers(id) on delete restrict;

-- Comments so grep + \d output tells future readers what these are for.
comment on column public.fifo_cost_layers.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.inventory_stock_movements.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.warehouse_stock_allocations.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.stock_adjustments.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.receival_items.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.warehouse_transfer_items.sub_container_id is
  'Warehouse Model v2 — per-division stock partition. Nullable until Phase C.';
comment on column public.warehouse_transfers.from_sub_container_id is
  'Warehouse Model v2 — source sub-container. Nullable until Phase C; check_different_sub_containers CHECK lands in Phase C.';
comment on column public.warehouse_transfers.to_sub_container_id is
  'Warehouse Model v2 — destination sub-container. Nullable until Phase C.';

-- 3. warehouses.company_id (add + backfill + verify) ──────────────────
alter table public.warehouses
  add column company_id uuid references public.companies(id) on delete restrict;

comment on column public.warehouses.company_id is
  'Warehouse Model v2 — the company that owns this warehouse. Backfilled from division_id in Phase A; promoted to NOT NULL in Phase C. Virtual warehouses (repair vendors) also carry this — their division_id stays null.';

-- Backfill: every existing NON-virtual warehouse has a division_id, and
-- company_divisions.company_id resolves it deterministically. Virtual
-- warehouses (is_virtual=true) have division_id=null and don't map to a
-- company via that path — but they belong to the same company as their
-- linked repair_vendor's ambient tenant. Rather than infer that here (there
-- is only one company in the current schema per operator), we resolve
-- virtual warehouses to the single active company row. If more than one
-- company exists this migration will fail loudly and force a re-think.
update public.warehouses w
   set company_id = cd.company_id
  from public.company_divisions cd
 where w.division_id = cd.id
   and w.company_id  is null;

-- Handle virtual warehouses: pick the sole company row.
do $$
declare
  v_company_id uuid;
  v_company_count integer;
begin
  select count(*) into v_company_count from public.companies;
  if v_company_count = 0 then
    raise exception 'warehouse_model_v2 phase_a: cannot backfill virtual warehouses — public.companies is empty';
  elsif v_company_count > 1 then
    raise exception 'warehouse_model_v2 phase_a: multi-company tenant detected (% companies) — virtual-warehouse backfill needs re-derivation; ABORTING', v_company_count;
  end if;

  select id into v_company_id from public.companies limit 1;

  update public.warehouses
     set company_id = v_company_id
   where company_id is null
     and is_virtual = true;
end $$;

-- Assertion: every warehouse must now have company_id set.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing from public.warehouses where company_id is null;
  if v_missing > 0 then
    raise exception 'warehouse_model_v2 phase_a: % warehouses still have NULL company_id after backfill — ABORTING', v_missing;
  end if;
end $$;
