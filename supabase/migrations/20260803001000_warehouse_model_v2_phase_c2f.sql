-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase C.2.f: re-flip 8 sub_container_id columns to NOT NULL
--
-- Prior chain:
--   20260803000300 flipped these NOT NULL prematurely (before RPC sweep).
--   20260803000400 reverted the flip to close the regression window.
--   20260803000500 (C.2.a), 000600 (C.2.b), 000700 (C.2.c), 000800 (C.2.d),
--   000900 (C.2.e) landed the helper + trigger + RPC sweep.
--
-- Now every stock-writing RPC on staging populates sub_container_id. Safe
-- to promote the 8 columns to NOT NULL.
--
-- Belt-and-braces: re-run the Phase B backfill logic to catch any rows
-- written between Phase A schema land and today by RPCs that hadn't been
-- rewritten yet. Then assert zero NULLs remain before flipping.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Belt-and-braces backfill for any rows that leaked through with NULL
--    sub_container_id (RPCs called between Phase A and their C.2.x rewrite).

update public.fifo_cost_layers l
   set sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = l.warehouse_id
   and l.sub_container_id is null
   and l.warehouse_id is not null;

update public.inventory_stock_movements m
   set sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = m.warehouse_id
   and m.sub_container_id is null
   and m.warehouse_id is not null;

update public.warehouse_stock_allocations a
   set sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = a.warehouse_id
   and a.sub_container_id is null;

update public.stock_adjustments a
   set sub_container_id = sc.id
  from public.warehouse_sub_containers sc
 where sc.warehouse_id = a.warehouse_id
   and a.sub_container_id is null;

update public.receival_items ri
   set sub_container_id = sc.id
  from public.receivals r
  join public.warehouse_sub_containers sc on sc.warehouse_id = r.warehouse_id
 where ri.receival_id = r.id
   and ri.sub_container_id is null;

update public.warehouse_transfer_items ti
   set sub_container_id = sc.id
  from public.warehouse_transfers wt
  join public.warehouse_sub_containers sc on sc.warehouse_id = wt.from_warehouse_id
 where ti.transfer_id = wt.id
   and ti.sub_container_id is null;

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

-- 2. Assertion: zero NULL sub_container_id remains on real-warehouse rows.
--    Rows with NULL warehouse_id on fifo_cost_layers / inventory_stock_movements
--    (legacy debris; Phase B NOTICE confirmed 0 on staging) will also block
--    the NOT NULL flip, so verify count is still 0.
do $$
declare
  v_l  integer; v_m  integer; v_a  integer; v_j  integer; v_ri integer; v_ti integer;
  v_tf integer; v_tt integer;
  v_l_legacy integer; v_m_legacy integer;
begin
  select count(*) into v_l  from public.fifo_cost_layers            where sub_container_id is null;
  select count(*) into v_m  from public.inventory_stock_movements   where sub_container_id is null;
  select count(*) into v_a  from public.warehouse_stock_allocations where sub_container_id is null;
  select count(*) into v_j  from public.stock_adjustments           where sub_container_id is null;
  select count(*) into v_ri from public.receival_items              where sub_container_id is null;
  select count(*) into v_ti from public.warehouse_transfer_items    where sub_container_id is null;
  select count(*) into v_tf from public.warehouse_transfers         where from_sub_container_id is null;
  select count(*) into v_tt from public.warehouse_transfers         where to_sub_container_id   is null;

  select count(*) into v_l_legacy from public.fifo_cost_layers          where warehouse_id is null;
  select count(*) into v_m_legacy from public.inventory_stock_movements where warehouse_id is null;

  if (v_l + v_m + v_a + v_j + v_ri + v_ti + v_tf + v_tt) > 0 then
    raise exception 'phase_c2f: NULL sub_container_id remains after backfill (layers=%, movements=%, allocs=%, adjust=%, receival=%, items=%, tr_from=%, tr_to=%; legacy null-warehouse layers=%, movements=%) — ABORTING',
      v_l, v_m, v_a, v_j, v_ri, v_ti, v_tf, v_tt, v_l_legacy, v_m_legacy;
  end if;
end $$;

-- 3. Flip all 8 sub_container_id columns to NOT NULL.
alter table public.fifo_cost_layers            alter column sub_container_id     set not null;
alter table public.inventory_stock_movements   alter column sub_container_id     set not null;
alter table public.warehouse_stock_allocations alter column sub_container_id     set not null;
alter table public.stock_adjustments           alter column sub_container_id     set not null;
alter table public.receival_items              alter column sub_container_id     set not null;
alter table public.warehouse_transfer_items    alter column sub_container_id     set not null;
alter table public.warehouse_transfers         alter column from_sub_container_id set not null;
alter table public.warehouse_transfers         alter column to_sub_container_id   set not null;
