-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase C.1 partial revert: undo the 8 NOT NULL flips
--
-- Why: splitting Phase C into C.1 / C.2 / C.3 introduced a regression window
-- on staging — the NOT NULL columns land BEFORE the RPC sweep updates every
-- stock-writing RPC to populate sub_container_id. Any insert against the six
-- stock tables (create_and_approve_receival, rpc_process_return_restock,
-- apply_adjustment, create_transfer_v2, Phase 9 damaged-side, etc.) would
-- fail at runtime until Phase C.2 lands.
--
-- Fix: revert the 8 NOT NULL flips from 20260803000300. Keep everything else
-- from C.1 (nullable division_id on sub-container, _enforce_sub_container_division_rule
-- trigger, extended _repair_vendor_provision_warehouse trigger, virtual
-- sub-container backfill, orphan-transfer backfill). Phase C.2 will do the
-- RPC sweep and re-apply NOT NULL as its final step.
--
-- Prior migration: 20260803000300_warehouse_model_v2_phase_c1.sql.
-- ─────────────────────────────────────────────────────────────────────

alter table public.fifo_cost_layers            alter column sub_container_id     drop not null;
alter table public.inventory_stock_movements   alter column sub_container_id     drop not null;
alter table public.warehouse_stock_allocations alter column sub_container_id     drop not null;
alter table public.stock_adjustments           alter column sub_container_id     drop not null;
alter table public.receival_items              alter column sub_container_id     drop not null;
alter table public.warehouse_transfer_items    alter column sub_container_id     drop not null;
alter table public.warehouse_transfers         alter column from_sub_container_id drop not null;
alter table public.warehouse_transfers         alter column to_sub_container_id   drop not null;
