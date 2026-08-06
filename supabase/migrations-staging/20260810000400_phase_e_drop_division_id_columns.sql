-- ─────────────────────────────────────────────────────────────────────
-- Phase E — Migration D: drop denormalized division_id columns
--
-- After:
--   * Mig A rewrote every stock-writing RPC to stop stamping division_id
--     on the six stock tables.
--   * Mig B dropped the division_scope_r RLS policies that keyed on those
--     columns (and on warehouses.division_id itself).
--   * Mig C dropped the triggers that auto-populated division_id on
--     INSERT.
--
-- Every remaining reference to `division_id` on these tables is dead
-- weight — drop the columns + their indexes + FKs. Nothing else should
-- resolve to them post-Mig-B/C.
--
-- Order matters when a column has an FK: DROP the column, and Postgres
-- drops the FK constraint + any dependent indexes automatically.
--
-- Prior migration: 20260810000300_phase_e_drop_division_sync_triggers.sql
-- ─────────────────────────────────────────────────────────────────────

-- 1. Six stock tables — the whole point of Phase E.
alter table public.fifo_cost_layers            drop column if exists division_id;
alter table public.inventory_stock_movements   drop column if exists division_id;
alter table public.warehouse_stock_allocations drop column if exists division_id;
alter table public.stock_adjustments           drop column if exists division_id;
alter table public.receival_items              drop column if exists division_id;
alter table public.warehouse_transfer_items    drop column if exists division_id;

-- 2. Denormalized division_id on warehouse_transfers header — sub-container
--    linkage (from/to_sub_container_id) is the source of truth now.
alter table public.warehouse_transfers drop column if exists division_id;

-- 3. warehouses.division_id — the original culprit. Warehouses now belong
--    to a company; per-division stock lives in warehouse_sub_containers.
alter table public.warehouses drop column if exists division_id;
