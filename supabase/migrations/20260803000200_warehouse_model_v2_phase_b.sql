-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase B: data backfill
--
-- Ships:
--   1. One default warehouse_sub_containers row per non-virtual warehouse
--      × its current division_id.
--   2. sub_container_id populated on every stock row whose parent
--      warehouse_id is non-null and points to a real warehouse.
--   3. from_sub_container_id / to_sub_container_id populated on every
--      warehouse_transfers row whose endpoints are BOTH non-virtual.
--   4. Legacy edge cases (NULL warehouse_id on old stock rows, virtual
--      endpoints on repair transfers) logged via RAISE NOTICE — Phase C
--      must design against those counts before promoting the columns
--      NOT NULL.
--
-- After this migration:
--   - Every stock row with a non-null warehouse_id has non-null sub_container_id.
--   - Every warehouse_transfers row involving only real warehouses has
--     both FK columns populated.
--   - No RLS or RPC change.
--
-- Design spec: docs/warehouse-model-v2-design.md §Migration path §Phase B.
-- Prior migration: 20260803000100_warehouse_model_v2_phase_a.sql.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Auto-create one default sub-container per non-virtual warehouse ─
--    Skips warehouses with division_id IS NULL (virtual warehouses).
--    company_divisions has `name` (not name_en) — verified via schema grep.
insert into public.warehouse_sub_containers
  (warehouse_id, division_id, name, is_active, created_at, updated_at)
select
  w.id,
  w.division_id,
  coalesce(w.name, 'Warehouse') || ' — ' || coalesce(d.name, 'Division'),
  true,
  now(),
  now()
from public.warehouses w
join public.company_divisions d on d.id = w.division_id
where coalesce(w.is_virtual, false) = false
  and w.division_id is not null
  and not exists (
    select 1 from public.warehouse_sub_containers sc
    where sc.warehouse_id = w.id and sc.division_id = w.division_id
  );

-- 2. Assertion: every non-virtual warehouse with a division_id must now
--    have a matching sub-container.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
    from public.warehouses w
   where coalesce(w.is_virtual, false) = false
     and w.division_id is not null
     and not exists (
       select 1 from public.warehouse_sub_containers sc
       where sc.warehouse_id = w.id and sc.division_id = w.division_id
     );
  if v_missing > 0 then
    raise exception 'warehouse_model_v2 phase_b: % real warehouses have no sub-container after auto-provision — ABORTING', v_missing;
  end if;
end $$;

-- 3. Reject any pre-existing stock row that references a virtual warehouse.
--    Stock rows should only ever reference real warehouses; a virtual one
--    means a schema surprise Phase C's NOT NULL migration must handle
--    explicitly. Fail loudly rather than backfill nulls.
do $$
declare
  v_bad_layers      integer;
  v_bad_movements   integer;
  v_bad_allocs      integer;
  v_bad_adjust      integer;
  v_bad_receival    integer;
begin
  select count(*) into v_bad_layers
    from public.fifo_cost_layers l
    join public.warehouses w on w.id = l.warehouse_id
   where coalesce(w.is_virtual, false) = true;

  select count(*) into v_bad_movements
    from public.inventory_stock_movements m
    join public.warehouses w on w.id = m.warehouse_id
   where coalesce(w.is_virtual, false) = true;

  select count(*) into v_bad_allocs
    from public.warehouse_stock_allocations a
    join public.warehouses w on w.id = a.warehouse_id
   where coalesce(w.is_virtual, false) = true;

  select count(*) into v_bad_adjust
    from public.stock_adjustments a
    join public.warehouses w on w.id = a.warehouse_id
   where coalesce(w.is_virtual, false) = true;

  select count(*) into v_bad_receival
    from public.receival_items ri
    join public.receivals r on r.id = ri.receival_id
    join public.warehouses w on w.id = r.warehouse_id
   where coalesce(w.is_virtual, false) = true;

  if (v_bad_layers + v_bad_movements + v_bad_allocs + v_bad_adjust + v_bad_receival) > 0 then
    raise exception 'warehouse_model_v2 phase_b: virtual-warehouse stock rows detected (layers=%, movements=%, allocs=%, adjust=%, receival=%) — ABORTING; Phase B assumes real-warehouse-only stock',
      v_bad_layers, v_bad_movements, v_bad_allocs, v_bad_adjust, v_bad_receival;
  end if;
end $$;

-- 4. Backfill sub_container_id on the five directly-warehouse-scoped
--    stock tables. Rows with NULL warehouse_id are skipped — those are
--    legacy debris and get counted separately in step 8.
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

-- 5. Backfill warehouse_transfer_items via the parent transfer's FROM
--    warehouse. Items belong to the source side historically; Phase C's
--    dispatch/receive RPCs will handle the source→destination handoff.
--    Skips items whose parent transfer originates from a virtual warehouse
--    (return-from-repair transfer items) — those are handled together
--    with the transfer-header virtual-endpoint case in step 7.
update public.warehouse_transfer_items ti
   set sub_container_id = sc.id
  from public.warehouse_transfers wt
  join public.warehouse_sub_containers sc on sc.warehouse_id = wt.from_warehouse_id
 where ti.transfer_id = wt.id
   and ti.sub_container_id is null;

-- 6. Backfill warehouse_transfers.from_sub_container_id where FROM is
--    non-virtual, and to_sub_container_id where TO is non-virtual.
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

-- 7. Log the virtual-endpoint counts. These rows will still have NULLs
--    on one side after this migration — expected outcome. Phase C's
--    design must decide how virtual warehouses get a sub_container_id
--    (virtual-warehouse sub-container? Nullable check? Different FK?)
--    BEFORE promoting the columns to NOT NULL.
do $$
declare
  v_null_from integer;
  v_null_to   integer;
begin
  select count(*) into v_null_from from public.warehouse_transfers where from_sub_container_id is null;
  select count(*) into v_null_to   from public.warehouse_transfers where to_sub_container_id   is null;
  raise notice 'warehouse_model_v2 phase_b: warehouse_transfers with NULL from_sub_container_id = % (expected: transfers where from_warehouse_id is virtual)', v_null_from;
  raise notice 'warehouse_model_v2 phase_b: warehouse_transfers with NULL to_sub_container_id   = % (expected: transfers where to_warehouse_id   is virtual)', v_null_to;
end $$;

-- 8. Final assertion: every stock-table row that HAS a warehouse_id must
--    now have sub_container_id set. Rows with NULL warehouse_id (legacy
--    debris on the two tables that allow it — fifo_cost_layers,
--    inventory_stock_movements) are logged but NOT considered a failure.
--    Phase C's NOT NULL migration must decide how to handle them.
do $$
declare
  v_l  integer; v_m  integer; v_a  integer; v_j  integer; v_ri integer; v_ti integer;
  v_l_legacy integer; v_m_legacy integer;
begin
  -- Real-warehouse rows with null sub_container_id: hard failure.
  select count(*) into v_l  from public.fifo_cost_layers            where sub_container_id is null and warehouse_id is not null;
  select count(*) into v_m  from public.inventory_stock_movements   where sub_container_id is null and warehouse_id is not null;
  select count(*) into v_a  from public.warehouse_stock_allocations where sub_container_id is null;
  select count(*) into v_j  from public.stock_adjustments           where sub_container_id is null;
  select count(*) into v_ri from public.receival_items              where sub_container_id is null;
  select count(*) into v_ti
    from public.warehouse_transfer_items ti
    join public.warehouse_transfers wt on wt.id = ti.transfer_id
    join public.warehouses w on w.id = wt.from_warehouse_id
   where ti.sub_container_id is null
     and coalesce(w.is_virtual, false) = false;

  -- Legacy rows with null warehouse_id: informational.
  select count(*) into v_l_legacy from public.fifo_cost_layers          where warehouse_id is null;
  select count(*) into v_m_legacy from public.inventory_stock_movements where warehouse_id is null;

  if (v_l + v_m + v_a + v_j + v_ri + v_ti) > 0 then
    raise exception 'warehouse_model_v2 phase_b: NULL sub_container_id remains after backfill on real-warehouse rows (layers=%, movements=%, allocs=%, adjust=%, receival=%, items_from_real=%) — ABORTING',
      v_l, v_m, v_a, v_j, v_ri, v_ti;
  end if;

  raise notice 'warehouse_model_v2 phase_b: legacy NULL-warehouse_id rows (informational, not blocking) — fifo_cost_layers=%, inventory_stock_movements=%', v_l_legacy, v_m_legacy;
end $$;
