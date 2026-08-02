-- ─────────────────────────────────────────────────────────────────────
-- Phase E — Migration C: drop the denormalized-division sync triggers
--
-- The Phase A-era `set_division_from_*` triggers mirrored the parent
-- warehouse/receival/transfer's division_id onto every new stock row.
-- The Phase C-era `_sync_division_from_sub_container` trigger did the
-- same via the sub-container. Both become redundant once `division_id`
-- is gone from stock tables (Mig D).
--
-- Mig A rewrote the 9 RPCs to stop stamping division_id explicitly, but
-- the triggers were still filling it in silently. That's fine while the
-- column exists — dropping the trigger BEFORE Mig D removes the column
-- keeps the writes clean. If the RPC rewrites are ever partial (some
-- caller still passes `division_id: X`), the write just fails with a
-- clear "column doesn't exist" after Mig D, not silent data drift.
--
-- Every DROP uses IF EXISTS so re-runs are no-ops.
--
-- Prior migration: 20260810000200_phase_e_drop_division_scope_policies.sql
-- ─────────────────────────────────────────────────────────────────────

-- Triggers (must drop before functions — Postgres refuses to DROP a
-- function while a trigger still references it).
drop trigger if exists trg_fifo_cost_layers_set_division            on public.fifo_cost_layers;
drop trigger if exists trg_inventory_stock_movements_set_division   on public.inventory_stock_movements;
drop trigger if exists trg_receival_items_set_division              on public.receival_items;
drop trigger if exists trg_warehouse_transfers_set_division         on public.warehouse_transfers;

drop trigger if exists trg_sync_division_from_sub_container on public.fifo_cost_layers;
drop trigger if exists trg_sync_division_from_sub_container on public.inventory_stock_movements;
drop trigger if exists trg_sync_division_from_sub_container on public.receival_items;

-- The set_consumer_division_from_sale_order trigger (D.12) still stamps
-- consumer_division_id — that column STAYS. Do NOT drop it.

-- Also drop the `receivals` trigger which uses set_division_from_warehouse
-- (surfaced during first apply attempt). The receivals table keeps its
-- division_id column — callers set it explicitly from the PO context.
drop trigger if exists trg_receivals_set_division on public.receivals;

-- Trigger functions. Use CASCADE as a belt-and-braces catch for any other
-- triggers we haven't enumerated (e.g. on sale_deliveries or other tables
-- that inherit the warehouse-division cascade). The functions are all being
-- deleted because Phase E removes their reason to exist; any trigger left
-- pointing at them is dead weight.
drop function if exists public.set_division_from_warehouse()      cascade;
drop function if exists public.set_division_from_receival()       cascade;
drop function if exists public.set_division_from_from_warehouse() cascade;
drop function if exists public._sync_division_from_sub_container() cascade;
