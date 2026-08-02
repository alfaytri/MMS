-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase D.14: bulk inventory import routing defaults
--
-- Ships two nullable, informational columns on inventory_items that the
-- D.14 Excel importer stamps on newly-created items. Receival, delivery,
-- and cascade pickers MAY pre-fill from these; they are NOT required to.
-- Item-level defaults take precedence over the D.8 category-level default
-- (`inventory_categories.default_sub_container_id`) when both are set.
--
-- Nothing existing reads these columns yet — this is a pure add.
--
-- Plan: docs/superpowers/plans/2026-08-02-warehouse-model-v2-phase-d14-bulk-inventory-import.md
-- Prior migration: 20260802001000_phase_d12_sub_container_lookup_and_create_delivery.sql
-- ─────────────────────────────────────────────────────────────────────

alter table public.inventory_items
  add column default_sub_container_id uuid references public.warehouse_sub_containers(id) on delete set null,
  add column default_warehouse_id     uuid references public.warehouses(id)               on delete set null;

-- Partial indexes: overwhelmingly most items won't carry a routing default,
-- so a partial index keeps the index footprint small while still making the
-- reverse-lookup fast when receival dialogs pre-fill by item.
create index idx_inventory_items_default_sub_container_id
  on public.inventory_items(default_sub_container_id)
  where default_sub_container_id is not null;

create index idx_inventory_items_default_warehouse_id
  on public.inventory_items(default_warehouse_id)
  where default_warehouse_id is not null;

comment on column public.inventory_items.default_sub_container_id is
  'Phase D.14 — informational routing default set by the bulk Excel importer. Receival/delivery dialogs MAY pre-fill from this; item-level default takes precedence over category-level default (D.8) when both are set. NULL for items created via the standard master-data UI.';

comment on column public.inventory_items.default_warehouse_id is
  'Phase D.14 — informational routing default set by the bulk Excel importer. Warehouse companion to default_sub_container_id — the warehouse hosting the default sub-container.';
