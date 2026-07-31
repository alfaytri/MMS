-- ─────────────────────────────────────────────────────────────────────
-- Warehouse Model v2 — Phase C.2.a: sub-container resolution helper +
-- denormalized-division_id triggers.
--
-- Ships:
--   1. Helper `public._find_or_create_sub_container(warehouse_id, division_id)`
--      that returns the sub-container id, auto-creating one on first call
--      per (warehouse, division) pair. Used by every stock-writing RPC
--      in the subsequent C.2.b–C.2.e chunks.
--   2. BEFORE-INSERT/UPDATE trigger on each of the 3 stock tables that
--      HAS a division_id column (fifo_cost_layers, inventory_stock_movements,
--      receival_items). Trigger sets NEW.division_id from the sub-container's
--      division so the two can never drift.
--   3. The other 3 tables (warehouse_stock_allocations, stock_adjustments,
--      warehouse_transfer_items) have no division_id column — nothing to
--      denormalize. Their Phase C.3 RLS will check sub_container_id only.
--
-- Nothing behaves differently yet — this is pure infrastructure for the
-- C.2.b/c/d/e RPC-sweep chunks to lean on. Existing writes still work
-- unchanged (they don't call the helper, don't set sub_container_id).
--
-- Design spec: docs/warehouse-model-v2-design.md §RPC-level behavior details.
-- Prior migrations: 20260803000100/200/300/400 (Phase A + B + C.1 + revert).
-- ─────────────────────────────────────────────────────────────────────

-- 1. Sub-container find-or-create helper ──────────────────────────────
-- If a sub-container for (warehouse_id, division_id) already exists (any
-- active row — operator may have created multiple named ones per pair),
-- return the oldest one. Otherwise create one with the default name and
-- return its id. Callers (stock-writing RPCs in C.2.b–C.2.e) pass the
-- division_id they've already resolved from their business context
-- (PO division, return line division, adjustment layer division, etc.).
create or replace function public._find_or_create_sub_container(
  p_warehouse_id uuid,
  p_division_id  uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_wh_name  text;
  v_div_name text;
begin
  if p_warehouse_id is null then
    raise exception '_find_or_create_sub_container: p_warehouse_id required';
  end if;
  -- p_division_id NULL is only valid for virtual warehouses (per Option A
  -- Variant 1 design). Let the sub-container INSERT hit the
  -- _enforce_sub_container_division_rule trigger for real-warehouse enforcement.

  select id into v_id
    from public.warehouse_sub_containers
   where warehouse_id = p_warehouse_id
     and division_id is not distinct from p_division_id
     and is_active
   order by created_at
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Not found — create one.
  select name into v_wh_name  from public.warehouses         where id = p_warehouse_id;
  if p_division_id is not null then
    select name into v_div_name from public.company_divisions where id = p_division_id;
  end if;

  insert into public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active, created_by)
  values (
    p_warehouse_id,
    p_division_id,
    coalesce(v_wh_name, 'Warehouse') || case when v_div_name is null then '' else ' — ' || v_div_name end,
    true,
    public._current_user_data_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public._find_or_create_sub_container(uuid, uuid) from public;
grant  execute on function public._find_or_create_sub_container(uuid, uuid) to authenticated, service_role;

comment on function public._find_or_create_sub_container(uuid, uuid) is
  'Warehouse Model v2 — resolve the sub-container for (warehouse, division). Creates one on first call per pair. Called by every stock-writing RPC in Phase C.2.b–C.2.e.';

-- 2. Denormalize division_id from sub_container_id — the 3 tables that
--    have both columns. Trigger always overrides NEW.division_id with the
--    value derived from NEW.sub_container_id, so the two can never drift
--    once sub_container_id is populated. Rows with NEW.sub_container_id NULL
--    keep whatever division_id was explicitly passed (pre-C.2.b writes).
create or replace function public._sync_division_from_sub_container()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sub_container_id is not null then
    select division_id into new.division_id
      from public.warehouse_sub_containers
     where id = new.sub_container_id;
  end if;
  return new;
end;
$$;

revoke execute on function public._sync_division_from_sub_container() from public;
grant  execute on function public._sync_division_from_sub_container() to authenticated, service_role;

comment on function public._sync_division_from_sub_container() is
  'Warehouse Model v2 — BEFORE INSERT/UPDATE trigger body that syncs a stock row''s denormalized division_id from its sub_container_id. Attached to fifo_cost_layers, inventory_stock_movements, receival_items — the 3 stock tables with a division_id column. The other 3 (warehouse_stock_allocations, stock_adjustments, warehouse_transfer_items) have no division_id and skip this trigger.';

drop trigger if exists trg_sync_division_from_sub_container on public.fifo_cost_layers;
create trigger trg_sync_division_from_sub_container
  before insert or update of sub_container_id on public.fifo_cost_layers
  for each row
  execute function public._sync_division_from_sub_container();

drop trigger if exists trg_sync_division_from_sub_container on public.inventory_stock_movements;
create trigger trg_sync_division_from_sub_container
  before insert or update of sub_container_id on public.inventory_stock_movements
  for each row
  execute function public._sync_division_from_sub_container();

drop trigger if exists trg_sync_division_from_sub_container on public.receival_items;
create trigger trg_sync_division_from_sub_container
  before insert or update of sub_container_id on public.receival_items
  for each row
  execute function public._sync_division_from_sub_container();
