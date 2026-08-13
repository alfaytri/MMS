-- Virtual Warehouses — Migration 1 of 4: warehouse_kind → behavior model, Places → Projects
-- Design: docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md
--
-- Collapses the two hardcoded custody kinds 'teams' + 'places' into ONE 'custody'
-- behavior. The container backbone (warehouse → sub-containers, stock ledgered per
-- sub-container) is unchanged; only the discriminator narrows. 'repair' + 'general'
-- are untouched. warehouse_kind is a plain text column + CHECK (no enum type, no FK),
-- so the swap is a safe drop-migrate-readd.
--
-- Live pre-check (staging 2026-08-12): warehouses_kind_check =
--   CHECK (warehouse_kind IN ('general','repair','teams','places')); virtual rows =
--   Teams(teams), Repair(repair), Places(places). warehouses has an updated_at column.
--
-- NOTE: the custody/consumption RPCs that still test warehouse_kind IN ('teams','places')
-- are rewritten in migration 3 of this set; all four migrations apply together via one
-- `db push`, so the end state is consistent before anything serves traffic.

-- 1. Drop the old CHECK so the data migration can proceed.
alter table public.warehouses drop constraint if exists warehouses_kind_check;

-- 2. Collapse teams + places → custody (keeps each warehouse's own name/rows).
update public.warehouses
   set warehouse_kind = 'custody', updated_at = now()
 where warehouse_kind in ('teams','places');

-- 3. Rename the ex-'places' warehouse to 'Projects' (operator rename Places → Projects).
update public.warehouses
   set name = 'Projects', updated_at = now()
 where name = 'Places' and warehouse_kind = 'custody';

-- 4. New behavior CHECK: general | repair | custody.
alter table public.warehouses
  add constraint warehouses_kind_check
  check (warehouse_kind in ('general','repair','custody'));

comment on column public.warehouses.warehouse_kind is
'Behavior discriminator (operator-picked at warehouse creation):
  general — real physical warehouse holding real stock (receivals, transfers, sales sourcing).
  repair  — shared virtual WH; sub-containers are repair vendors (send-for-repair target).
  custody — virtual WH; sub-containers are custody locations (teams / projects / sites),
            supporting custody assign/return + consumption COGS.
Unlimited named instances allowed per behavior. Kept alongside is_virtual for back-compat.';
