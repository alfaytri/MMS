-- Phase 9 — Sub-task 9.3: implement restock_as_damaged disposition.
--
-- Fills the stub left by Phase 7/8 in TWO call sites:
--   1. public._record_inventory_disposition — the low-level recorder now
--      performs the full damaged-stock side-effects (FIFO layer + aggregate
--      upsert + movement row) for disposition_type='restock_as_damaged',
--      instead of only inserting the return_line_inventory_dispositions row.
--   2. public.rpc_record_inventory_disposition and
--      public.rpc_create_partial_replacement — their dispatch loops now call
--      the recorder for restock_as_damaged instead of raising
--      'not yet implemented'. This mirrors how write_off is dispatched in
--      both functions (inline caller work + perform _record_inventory_
--      disposition), except restock_as_damaged's extra work (FIFO layer /
--      aggregate / movement) lives inside the recorder itself because the
--      recorder is the only place that already validates condition='damaged'
--      and qty <= inventory_remaining_qty — duplicating that guard in two
--      call sites would drift.
--
-- Live-body archaeology (per feedback_rewrite_functions_from_live_db —
-- baseline_schema.sql is stale):
--   _record_inventory_disposition      <- 20260730000200_rpc_dual_ledger_recorders.sql (only CREATE, never replaced since)
--   rpc_record_inventory_disposition   <- 20260730000500_fix_write_off_double_movement.sql (latest CREATE OR REPLACE)
--   rpc_create_partial_replacement     <- 20260731000700_fix_rpc_partial_replacement_unit_price_select.sql (latest CREATE OR REPLACE)
--
-- Corrections vs. the plan's illustrative SQL (docs/superpowers/plans/2026-07-30-phase-9-damaged-stock-dispositions.md, Task 4):
--   - The progress view is named `return_line_progress`, not `v_return_line_progress`.
--     It already exposes `return_id`, `brand_variant_id`, `inventory_remaining_qty`
--     directly — no extra join to return_lines/so_po_returns needed for those.
--   - so_po_returns has NO `warehouse_id` column (it has `restock_warehouse_id`,
--     which is the warehouse the return was restocked to at intake time — not
--     necessarily the warehouse the operator wants the damaged stock parked in
--     at disposition time). Both call sites already receive an explicit
--     p_warehouse_id parameter from the operator (same one write_off's inline
--     inventory_stock_movements insert uses) — that's the correct source, so
--     _record_inventory_disposition gains a new p_warehouse_id parameter and
--     both dispatchers pass their own p_warehouse_id through.
--   - _return_line_fifo_unit_cost's real signature is
--     (p_return_id uuid, p_return_line_id uuid, p_qty numeric) — NOT
--     (return_line_id, brand_variant_id, qty) as the plan snippet showed.
--     return_line_progress.return_id supplies the first argument.

-- ─── 0. Relax the Phase 7 link-matches-type constraint ───────────────────
-- return_line_inventory_dispositions_link_matches_type (created in
-- 20260730000000_dual_ledger_tables.sql, BEFORE the Phase 9 brainstorm/A2
-- decision existed) required restock_as_damaged to carry a non-null
-- inventory_stock_movement_id, mirroring write_off. That assumed damaged
-- restocks would still get a legacy inventory_stock_movements audit row.
-- Decision A2 (dedicated inventory_damaged_stock/_layers/_movements tables)
-- superseded that: restock_as_damaged now books its own
-- inventory_damaged_movements row instead, and never touches
-- inventory_stock_movements. So the CHECK must allow restock_as_damaged with
-- BOTH FKs null. (Manual verification during this task hit the old
-- constraint's 23514 violation before this fix was added — confirms the
-- plan's assumption that "the 9.1 CHECK already allows this shape" was
-- incorrect; the constraint actually predates 9.1 and needed this update.)

alter table public.return_line_inventory_dispositions
  drop constraint if exists return_line_inventory_dispositions_link_matches_type;

alter table public.return_line_inventory_dispositions
  add constraint return_line_inventory_dispositions_link_matches_type check (
    case disposition_type
      when 'write_off'           then inventory_stock_movement_id is not null and warehouse_transfer_id is null
      when 'restock_as_damaged'  then inventory_stock_movement_id is null     and warehouse_transfer_id is null
      when 'send_for_repair'     then warehouse_transfer_id is not null
    end
  );

-- ─── 1. _record_inventory_disposition ────────────────────────────────────
-- Adding a new trailing parameter is NOT a valid CREATE OR REPLACE target
-- (Postgres treats a different arg list as a distinct overload); drop the
-- old 6-arg signature explicitly first, then create the 7-arg replacement.

drop function if exists public._record_inventory_disposition(uuid, text, numeric, uuid, uuid, text);

create or replace function public._record_inventory_disposition(
  p_return_line_id              uuid,
  p_disposition_type            text,
  p_qty                         numeric,
  p_inventory_stock_movement_id uuid default null,
  p_warehouse_transfer_id       uuid default null,
  p_notes                       text default null,
  p_warehouse_id                uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition     text;
  v_remaining     numeric;
  v_return_id     uuid;
  v_brand_variant uuid;
  v_unit_cost     numeric;
  v_new_id        uuid;
begin
  if p_disposition_type not in ('write_off','restock_as_damaged','send_for_repair') then
    raise exception '_record_inventory_disposition: invalid disposition_type %', p_disposition_type;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception '_record_inventory_disposition: qty must be > 0 (got %)', p_qty;
  end if;

  select rl.condition, p.inventory_remaining_qty, p.return_id, p.brand_variant_id
    into v_condition, v_remaining, v_return_id, v_brand_variant
    from public.return_lines rl
    join public.return_line_progress p on p.return_line_id = rl.id
    where rl.id = p_return_line_id;
  if v_condition is null then
    raise exception '_record_inventory_disposition: return_line % not found', p_return_line_id;
  end if;
  if v_condition <> 'damaged' then
    raise exception '_record_inventory_disposition: return_line % is not damaged (condition=%)', p_return_line_id, v_condition;
  end if;
  if p_qty > coalesce(v_remaining, 0) then
    raise exception '_record_inventory_disposition: qty % exceeds inventory remaining %', p_qty, coalesce(v_remaining, 0);
  end if;

  if p_disposition_type = 'restock_as_damaged' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for restock_as_damaged';
  end if;

  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  if p_disposition_type = 'restock_as_damaged' then
    -- Cost basis comes from the FIFO layers backing the original sale, same
    -- helper the write-off branch uses. return_lines has no unit_price/
    -- unit_cost column (Phase 8.7 sub-fix confirmed).
    v_unit_cost := public._return_line_fifo_unit_cost(v_return_id, p_return_line_id, p_qty);

    -- 1. FIFO layer in damaged stock.
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, auth.uid());

    -- 2. Aggregated damaged-stock balance (weighted-average cost).
    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_brand_variant, p_qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    -- 3. Audit-ledger movement row.
    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, auth.uid()
    );
  end if;

  return v_new_id;
end;
$$;

revoke execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text,uuid) from public;
grant  execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text,uuid) to service_role;

comment on function public._record_inventory_disposition is
  'Internal. Inserts one row in return_line_inventory_dispositions after validating (a) return_line is damaged and (b) qty <= inventory_remaining_qty. For disposition_type=restock_as_damaged also books a FIFO layer + aggregate upsert + movement row into the damaged-stock tables (p_warehouse_id required in that case). Called by the action wrappers only.';

-- ─── 2. rpc_record_inventory_disposition ─────────────────────────────────
-- Full function body preserved verbatim from 20260730000500 except the
-- restock_as_damaged branch, which now dispatches to the recorder instead
-- of raising.

create or replace function public.rpc_record_inventory_disposition(
  p_return_id     uuid,
  p_warehouse_id  uuid,
  p_dispositions  jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp         jsonb;
  v_disp_line_id uuid;
  v_disp_type    text;
  v_disp_qty     numeric;
  v_return_line  record;
  v_mov_id       uuid;
  v_unit_cost    numeric;
  v_count        int := 0;
begin
  if not exists (
    select 1 from public.so_po_returns
    where id = p_return_id and deleted_at is null
  ) then
    raise exception 'rpc_record_inventory_disposition: return % not found', p_return_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_record_inventory_disposition: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_dispositions) <> 'array' or jsonb_array_length(p_dispositions) = 0 then
    raise exception 'rpc_record_inventory_disposition: p_dispositions must be a non-empty array';
  end if;

  for v_disp in select * from jsonb_array_elements(p_dispositions) loop
    v_disp_line_id := (v_disp->>'return_line_id')::uuid;
    v_disp_type    := v_disp->>'type';
    v_disp_qty     := (v_disp->>'qty')::numeric;

    if v_disp_type = 'write_off' then
      select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes, rl.return_id
        into v_return_line
        from public.return_lines rl
        where rl.id = v_disp_line_id;
      if v_return_line.item_name is null then
        raise exception 'rpc_record_inventory_disposition: return_line % not found', v_disp_line_id;
      end if;
      if v_return_line.return_id <> p_return_id then
        raise exception 'rpc_record_inventory_disposition: return_line % does not belong to return %', v_disp_line_id, p_return_id;
      end if;

      v_unit_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

      insert into public.inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) values (
        p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
        'sale_return_damaged'::public.stock_movement_type,
        v_disp_qty::integer,
        v_unit_cost,
        'return', p_return_id,
        coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
      ) returning id into v_mov_id;

      perform public._record_inventory_disposition(
        p_return_line_id              => v_disp_line_id,
        p_disposition_type            => 'write_off',
        p_qty                         => v_disp_qty,
        p_inventory_stock_movement_id => v_mov_id
      );

    elsif v_disp_type = 'restock_as_damaged' then
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'restock_as_damaged',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

    elsif v_disp_type = 'send_for_repair' then
      raise exception 'rpc_record_inventory_disposition: disposition type send_for_repair is not yet implemented (Phase 9)';

    else
      raise exception 'rpc_record_inventory_disposition: unknown disposition type %', v_disp_type;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public._maybe_close_return(p_return_id);
  end if;
  return v_count;
end;
$$;

grant execute on function public.rpc_record_inventory_disposition(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.rpc_record_inventory_disposition is
  'After-the-fact inventory disposition for damaged returns. Iterates p_dispositions and books an inventory_stock_movements row (FIFO cost via _return_line_fifo_unit_cost) + return_line_inventory_dispositions row for write_off, or a damaged-stock FIFO layer/aggregate/movement + disposition row (via _record_inventory_disposition) for restock_as_damaged. send_for_repair raises "not yet implemented" (Phase 9.4). Closes the return if both ledgers cover.';

-- ─── 3. rpc_create_partial_replacement ───────────────────────────────────
-- Full function body preserved verbatim from 20260731000700 except the
-- restock_as_damaged branch inside the disposition loop.

create or replace function public.rpc_create_partial_replacement(
  p_return_id      uuid,
  p_warehouse_id   uuid,
  p_lines          jsonb,
  p_gift_items     jsonb default '[]'::jsonb,
  p_dispositions   jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_return         record;
  v_customer_id    uuid;
  v_sale_order_id  uuid;
  v_division_id    uuid;
  v_delivery_id    uuid;
  v_delivery_num   text;
  v_line           jsonb;
  v_line_id        uuid;
  v_line_qty       numeric;
  v_return_line    record;
  v_gift           jsonb;
  v_gift_variant   uuid;
  v_gift_qty       numeric;
  v_gift_item      record;
  v_disp           jsonb;
  v_disp_line_id   uuid;
  v_disp_type      text;
  v_disp_qty       numeric;
  v_disp_transfer  uuid;
  v_mov_id         uuid;
  v_disp_cost      numeric;
begin
  select id, source_type, source_id, division_id, status, return_number
    into v_return
    from public.so_po_returns
    where id = p_return_id and deleted_at is null
    for update;
  if not found then
    raise exception 'rpc_create_partial_replacement: return % not found', p_return_id;
  end if;
  if v_return.source_type <> 'sale_order' then
    raise exception 'rpc_create_partial_replacement: expected source_type=sale_order, got %', v_return.source_type;
  end if;
  if v_return.status not in ('restocked','resolved_credit','resolved_replacement','resolved_partial') then
    raise exception 'rpc_create_partial_replacement: return % status is % — must be restocked or a resolved_* value', v_return.return_number, v_return.status;
  end if;

  v_sale_order_id := v_return.source_id;
  v_division_id   := v_return.division_id;

  select customer_id into v_customer_id
    from public.sale_orders where id = v_sale_order_id;
  if v_customer_id is null then
    raise exception 'rpc_create_partial_replacement: sale_order % has no customer', v_sale_order_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_create_partial_replacement: warehouse % not found', p_warehouse_id;
  end if;

  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'rpc_create_partial_replacement: p_lines must be a jsonb array';
  end if;

  -- 1. Create the replacement delivery header (only when we have real lines OR gifts).
  if jsonb_array_length(p_lines) > 0 or jsonb_array_length(coalesce(p_gift_items, '[]'::jsonb)) > 0 then
    v_delivery_num := public.next_delivery_number();
    insert into public.sale_deliveries (
      delivery_number, sale_order_id, warehouse_id, delivery_date,
      status, type, division_id, notes
    ) values (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', v_division_id,
      'Replacement for return ' || v_return.return_number
    ) returning id into v_delivery_id;
  end if;

  -- 2. Iterate replacement lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    if v_line_qty is null or v_line_qty <= 0 then
      continue;
    end if;

    select rl.brand_variant_id, rl.item_name, rl.sku, rl.unit_price
      into v_return_line
      from public.return_lines rl
      where rl.id = v_line_id and rl.return_id = p_return_id;
    if v_return_line.item_name is null then
      raise exception 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    end if;

    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku,
      qty, unit_price
    ) values (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty, coalesce(v_return_line.unit_price, 0)
    );

    perform public._record_customer_resolution(
      p_return_line_id    => v_line_id,
      p_resolution_type   => 'replacement',
      p_qty               => v_line_qty,
      p_sale_delivery_id  => v_delivery_id
    );
  end loop;

  -- 3. Gift items (goodwill add-ons — no ledger, just delivery lines)
  for v_gift in select * from jsonb_array_elements(coalesce(p_gift_items, '[]'::jsonb)) loop
    v_gift_variant := (v_gift->>'brand_variant_id')::uuid;
    v_gift_qty     := (v_gift->>'qty')::numeric;
    if v_gift_variant is null or v_gift_qty is null or v_gift_qty <= 0 then
      continue;
    end if;
    select item_name, sku into v_gift_item
      from public.inventory_item_brand_variants where id = v_gift_variant;
    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku,
      qty, unit_price, is_gift
    ) values (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty, 0, true
    );
  end loop;

  -- 4. Inventory dispositions (write_off / restock_as_damaged / send_for_repair)
  if jsonb_typeof(p_dispositions) = 'array' and jsonb_array_length(p_dispositions) > 0 then
    for v_disp in select * from jsonb_array_elements(p_dispositions) loop
      v_disp_line_id  := (v_disp->>'return_line_id')::uuid;
      v_disp_type     := v_disp->>'type';
      v_disp_qty      := (v_disp->>'qty')::numeric;
      v_disp_transfer := nullif(v_disp->>'transfer_id', '')::uuid;

      if v_disp_type = 'write_off' then
        select rl.brand_variant_id, rl.item_name, rl.sku, rl.condition_notes
          into v_return_line
          from public.return_lines rl
          where rl.id = v_disp_line_id;
        if v_return_line.item_name is null then
          raise exception 'rpc_create_partial_replacement: disposition return_line % not found', v_disp_line_id;
        end if;

        v_disp_cost := public._return_line_fifo_unit_cost(p_return_id, v_disp_line_id, v_disp_qty);

        insert into public.inventory_stock_movements (
          warehouse_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost, reference_type, reference_id, notes
        ) values (
          p_warehouse_id, v_return_line.brand_variant_id, v_return_line.item_name, nullif(v_return_line.sku, ''),
          'sale_return_damaged'::public.stock_movement_type,
          v_disp_qty::integer,
          v_disp_cost,
          'return', p_return_id,
          coalesce(v_return_line.condition_notes, 'Damaged on customer return — written off')
        ) returning id into v_mov_id;

        perform public._record_inventory_disposition(
          p_return_line_id              => v_disp_line_id,
          p_disposition_type            => 'write_off',
          p_qty                         => v_disp_qty,
          p_inventory_stock_movement_id => v_mov_id
        );

      elsif v_disp_type = 'restock_as_damaged' then
        perform public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'restock_as_damaged',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

      elsif v_disp_type = 'send_for_repair' then
        raise exception 'rpc_create_partial_replacement: disposition type send_for_repair is not yet implemented (Phase 9)';

      else
        raise exception 'rpc_create_partial_replacement: unknown disposition type %', v_disp_type;
      end if;
    end loop;
  end if;

  perform public._maybe_close_return(p_return_id);
  return v_delivery_id;
end;
$function$;

grant execute on function public.rpc_create_partial_replacement(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;
