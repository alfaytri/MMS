-- ─────────────────────────────────────────────────────────────────────
-- Phase E — Migration B: drop legacy division-scope RLS policies
--
-- Every stock table now has parallel `sub_container_scope_*_r` policies
-- (Phase C.3) that cover the same access surface as the older
-- `division_scope_*_r` policies. Once the denormalized `division_id`
-- column disappears from those tables (Mig D), the division-scope
-- policies become invalid — drop them first so the column drop is
-- clean. Every DROP uses IF EXISTS so re-running the migration is safe.
--
-- Warehouses table itself keeps its permissive `Internal users can
-- (view|insert|update|delete)` rules (all `true`) + the new
-- `sub_container_scope_select_r`. Dropping division_scope_r is a
-- net-loosening of the write side (any authenticated user can now
-- INSERT/UPDATE/DELETE a warehouse row) — that matches the design
-- intent: warehouse admin lives on the master-data page, which has
-- app-level auth gating.
--
-- Prior migration: 20260808000300_phase_d14_inventory_defaults.sql
-- Plan: docs/superpowers/plans/2026-08-02-warehouse-model-v2-phase-e.md
-- ─────────────────────────────────────────────────────────────────────

-- fifo_cost_layers
drop policy if exists division_scope_select_r on public.fifo_cost_layers;
drop policy if exists division_scope_insert_r on public.fifo_cost_layers;
drop policy if exists division_scope_update_r on public.fifo_cost_layers;
drop policy if exists division_scope_delete_r on public.fifo_cost_layers;

-- inventory_stock_movements
drop policy if exists division_scope_select_r on public.inventory_stock_movements;
drop policy if exists division_scope_insert_r on public.inventory_stock_movements;
drop policy if exists division_scope_update_r on public.inventory_stock_movements;
drop policy if exists division_scope_delete_r on public.inventory_stock_movements;

-- receival_items
drop policy if exists division_scope_select_r on public.receival_items;
drop policy if exists division_scope_insert_r on public.receival_items;
drop policy if exists division_scope_update_r on public.receival_items;
drop policy if exists division_scope_delete_r on public.receival_items;

-- warehouse_transfer_items (gates via parent warehouse_transfers.division_id)
drop policy if exists division_scope_select_r on public.warehouse_transfer_items;
drop policy if exists division_scope_insert_r on public.warehouse_transfer_items;
drop policy if exists division_scope_update_r on public.warehouse_transfer_items;
drop policy if exists division_scope_delete_r on public.warehouse_transfer_items;

-- warehouse_transfers
drop policy if exists division_scope_select_r on public.warehouse_transfers;
drop policy if exists division_scope_insert_r on public.warehouse_transfers;
drop policy if exists division_scope_update_r on public.warehouse_transfers;
drop policy if exists division_scope_delete_r on public.warehouse_transfers;

-- stock_adjustments (gates via warehouses.division_id EXISTS sub-select)
drop policy if exists division_scope_select_r on public.stock_adjustments;
drop policy if exists division_scope_insert_r on public.stock_adjustments;
drop policy if exists division_scope_update_r on public.stock_adjustments;
drop policy if exists division_scope_delete_r on public.stock_adjustments;

-- warehouse_stock_allocations (gates via warehouses.division_id EXISTS sub-select)
drop policy if exists division_scope_select_r on public.warehouse_stock_allocations;
drop policy if exists division_scope_insert_r on public.warehouse_stock_allocations;
drop policy if exists division_scope_update_r on public.warehouse_stock_allocations;
drop policy if exists division_scope_delete_r on public.warehouse_stock_allocations;

-- warehouses itself (permissive Internal-users policies cover the write side;
-- sub_container_scope_select_r covers reads)
drop policy if exists division_scope_select_r on public.warehouses;
drop policy if exists division_scope_insert_r on public.warehouses;
drop policy if exists division_scope_update_r on public.warehouses;
drop policy if exists division_scope_delete_r on public.warehouses;
