-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase C.1: schema tightening + virtual-warehouse
-- sub-container backfill.
--
-- Design decision recorded 2026-07-31 in docs/warehouse-model-v2-design.md
-- §Virtual-warehouse sub-container decision — Option A Variant 1
-- (nullable division_id on sub-container, ONLY for virtual warehouses).
--
-- Ships:
--   1. warehouse_sub_containers.division_id becomes nullable + BEFORE
--      trigger that enforces "real warehouse -> division required".
--   2. _repair_vendor_provision_warehouse trigger extended to auto-create
--      one warehouse_sub_containers row per newly-provisioned virtual
--      warehouse (division_id = NULL).
--   3. One-off backfill: create sub-containers for existing virtual
--      warehouses + backfill orphan warehouse_transfers rows + backfill
--      return-from-repair items.
--   4. Assertions before + Flip all 8 sub-container FK columns to NOT NULL.
--
-- Prior migrations:
--   20260803000100_warehouse_model_v2_phase_a.sql — additive schema
--   20260803000200_warehouse_model_v2_phase_b.sql — real-warehouse backfill
--   20260802000360_repair_vendor_trigger_security_definer.sql — the
--     live body of _repair_vendor_provision_warehouse this migration extends.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Nullable division_id on sub-container + enforcement trigger ──────
alter table public.warehouse_sub_containers
  alter column division_id drop not null;

create or replace function public._enforce_sub_container_division_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_virtual boolean;
begin
  select coalesce(is_virtual, false) into v_virtual
    from public.warehouses
   where id = new.warehouse_id;

  if new.division_id is null and v_virtual = false then
    raise exception '_enforce_sub_container_division_rule: division_id required for sub-containers on real (non-virtual) warehouses (warehouse_id=%)', new.warehouse_id;
  end if;

  return new;
end;
$$;

revoke execute on function public._enforce_sub_container_division_rule() from public;
grant  execute on function public._enforce_sub_container_division_rule() to authenticated, service_role;

drop trigger if exists trg_enforce_sub_container_division_rule on public.warehouse_sub_containers;
create trigger trg_enforce_sub_container_division_rule
  before insert or update of division_id, warehouse_id on public.warehouse_sub_containers
  for each row
  execute function public._enforce_sub_container_division_rule();

-- 2. Extend _repair_vendor_provision_warehouse trigger ─────────────────
-- Live body sourced from 20260802000360 (feedback_rewrite_functions_from_live_db).
-- Existing behavior preserved verbatim: INSERT warehouse (name, is_virtual,
-- repair_vendor_id, location) + UPDATE repair_vendors.virtual_warehouse_id.
-- APPENDED: INSERT one warehouse_sub_containers row per new virtual warehouse.
create or replace function public._repair_vendor_provision_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh_id uuid;
begin
  insert into public.warehouses (name, is_virtual, repair_vendor_id, location)
  values ('Repair: ' || new.name, true, new.id, 'Off-site repair vendor')
  returning id into v_wh_id;

  update public.repair_vendors
     set virtual_warehouse_id = v_wh_id
   where id = new.id;

  -- Warehouse Model v2 Phase C.1: auto-create one sub-container per
  -- virtual warehouse. division_id NULL is intentional — no division
  -- owns units sitting at a repair vendor. The _enforce_sub_container_division_rule
  -- trigger permits this because warehouse.is_virtual = true.
  insert into public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active)
  values
    (v_wh_id, null, new.name, true);

  return new;
end;
$$;

-- 3. One-off backfill: sub-containers for existing virtual warehouses ─
insert into public.warehouse_sub_containers
  (warehouse_id, division_id, name, is_active, created_at, updated_at)
select
  w.id,
  null,
  coalesce(rv.name, replace(w.name, 'Repair: ', ''), 'Repair Vendor'),
  true,
  now(),
  now()
from public.warehouses w
left join public.repair_vendors rv on rv.virtual_warehouse_id = w.id
where coalesce(w.is_virtual, false) = true
  and not exists (
    select 1 from public.warehouse_sub_containers sc
    where sc.warehouse_id = w.id
  );

-- 4. Backfill the orphan warehouse_transfers rows ──────────────────────
update public.warehouse_transfers wt
   set from_sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = wt.from_warehouse_id
   and wt.from_sub_container_id is null;

update public.warehouse_transfers wt
   set to_sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = wt.to_warehouse_id
   and wt.to_sub_container_id is null;

-- 5. Backfill warehouse_transfer_items whose parent transfer's FROM is
-- a virtual warehouse (return_from_repair items skipped by Phase B).
update public.warehouse_transfer_items ti
   set sub_container_id = sc.id
  from public.warehouse_transfers wt
  join public.warehouse_sub_containers sc on sc.warehouse_id = wt.from_warehouse_id
 where ti.transfer_id = wt.id
   and ti.sub_container_id is null;

-- 6. Assertions ────────────────────────────────────────────────────────
do $$
declare
  v_virt_missing integer;
  v_null_from    integer;
  v_null_to      integer;
  v_null_items   integer;
begin
  select count(*) into v_virt_missing
    from public.warehouses w
   where coalesce(w.is_virtual, false) = true
     and not exists (
       select 1 from public.warehouse_sub_containers sc
       where sc.warehouse_id = w.id
     );
  if v_virt_missing > 0 then
    raise exception 'phase_c1: % virtual warehouses without a sub-container after backfill — ABORTING', v_virt_missing;
  end if;

  select count(*) into v_null_from  from public.warehouse_transfers      where from_sub_container_id is null;
  select count(*) into v_null_to    from public.warehouse_transfers      where to_sub_container_id   is null;
  select count(*) into v_null_items from public.warehouse_transfer_items where sub_container_id      is null;

  if (v_null_from + v_null_to + v_null_items) > 0 then
    raise exception 'phase_c1: NULL sub-container FKs remain after backfill (from=%, to=%, items=%) — ABORTING', v_null_from, v_null_to, v_null_items;
  end if;
end $$;

-- 7. Flip all 8 sub-container FK columns to NOT NULL ──────────────────
alter table public.fifo_cost_layers            alter column sub_container_id set not null;
alter table public.inventory_stock_movements   alter column sub_container_id set not null;
alter table public.warehouse_stock_allocations alter column sub_container_id set not null;
alter table public.stock_adjustments           alter column sub_container_id set not null;
alter table public.receival_items              alter column sub_container_id set not null;
alter table public.warehouse_transfer_items    alter column sub_container_id set not null;
alter table public.warehouse_transfers         alter column from_sub_container_id set not null;
alter table public.warehouse_transfers         alter column to_sub_container_id   set not null;
