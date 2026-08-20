-- Index hot-path foreign keys (DB audit 2026-08-20).
--
-- Postgres does not auto-index FK columns; the audit found 140 uncovered FKs.
-- Tables are tiny today (largest ~1k rows) so there is no live impact yet — this
-- is preventative before transaction volume grows. Only the FKs on the
-- transaction / stock tables that are filtered on every stock, consumption, and
-- costing operation are indexed here; the cold `created_by` / audit FKs are left
-- alone. Plain CREATE INDEX (not CONCURRENTLY) — this runs inside the migration
-- transaction and the lock is negligible at current sizes. IF NOT EXISTS keeps it
-- idempotent across staging + new-prod.

create index if not exists idx_fifo_cost_layers_warehouse_id            on public.fifo_cost_layers (warehouse_id);
create index if not exists idx_fifo_cost_layers_sub_container_id         on public.fifo_cost_layers (sub_container_id);
create index if not exists idx_inv_stock_movements_warehouse_id         on public.inventory_stock_movements (warehouse_id);
create index if not exists idx_inv_stock_movements_sub_container_id      on public.inventory_stock_movements (sub_container_id);
create index if not exists idx_consumption_entries_consumer_sub         on public.consumption_entries (consumer_sub_container_id);
create index if not exists idx_consumption_entries_source_warehouse     on public.consumption_entries (source_warehouse_id);
create index if not exists idx_consumption_entries_discipline           on public.consumption_entries (discipline_id);
create index if not exists idx_consumption_entries_milestone            on public.consumption_entries (milestone_id);
create index if not exists idx_cogs_entries_consumer_sub                on public.cogs_entries (consumer_sub_container_id);
create index if not exists idx_cogs_entries_consumer_customer           on public.cogs_entries (consumer_customer_id);
create index if not exists idx_inv_damaged_stock_brand_variant          on public.inventory_damaged_stock (brand_variant_id);
create index if not exists idx_inv_damaged_stock_layers_brand_variant   on public.inventory_damaged_stock_layers (brand_variant_id);
create index if not exists idx_inv_damaged_movements_brand_variant      on public.inventory_damaged_movements (brand_variant_id);
