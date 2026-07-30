-- 9.2 follow-up fix: schema drift discovered while implementing the
-- repair-vendor virtual-warehouse trigger.
--
-- Migration 20260721100004_add_division_id_to_warehouses.sql made
-- warehouses.division_id NOT NULL for every row. That predates Phase 9 and
-- the plan's trigger body did not account for it: repair-vendor virtual
-- warehouses are off-site and not scoped to any single company division, so
-- the trigger's `insert into public.warehouses (name, is_virtual,
-- repair_vendor_id, location)` (no division_id) violated the NOT NULL
-- constraint and rolled back the whole repair_vendors insert.
--
-- Fix: relax the blanket NOT NULL to a conditional CHECK. Real (non-virtual)
-- warehouses still require a division_id; virtual repair warehouses may have
-- division_id null.

alter table public.warehouses
  alter column division_id drop not null;

alter table public.warehouses
  add constraint warehouses_division_required_unless_virtual
  check (is_virtual or division_id is not null);
