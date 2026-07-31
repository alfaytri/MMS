-- Phase 9 — Sub-task 9.4: implement send_for_repair disposition + rpc_send_damaged_for_repair.
--
-- Fills the last "not yet implemented" stub in the two dispatchers
-- (rpc_record_inventory_disposition + rpc_create_partial_replacement) and
-- adds the follow-up RPC that turns a send_for_repair disposition into an
-- actual outbound damaged-repair transfer.
--
-- Flow shape (matches the plan's two-step UX):
--   Step 1 — operator picks send_for_repair as the disposition; the dispatcher
--     records a return_line_inventory_dispositions row with
--     warehouse_transfer_id = NULL (vendor not chosen yet). No damaged-stock
--     side-effects at this point; the units are still logically "damaged, awaiting
--     vendor" — modelled as an implicit restock-into-damaged that will happen the
--     moment the operator picks a vendor.
--   Step 2 — operator picks a vendor + expected return date in the follow-up
--     dialog; rpc_send_damaged_for_repair fires. It: (a) restocks the units into
--     damaged stock at the source warehouse if they are not already there (mirrors
--     the restock_as_damaged path from 9.3 for units skipping straight to repair),
--     (b) consumes the same qty from damaged-stock FIFO, (c) creates a
--     warehouse_transfers row with transfer_kind='damaged_repair_out' targeting the
--     vendor's virtual warehouse, (d) stamps a send_for_repair_out movement, and
--     (e) links the disposition -> transfer.
--
-- Live-body archaeology (per feedback_rewrite_functions_from_live_db):
--   _record_inventory_disposition        <- 20260802000400_rpc_restock_as_damaged.sql (7-arg live)
--   rpc_record_inventory_disposition     <- 20260802000400 (send_for_repair still raises)
--   rpc_create_partial_replacement       <- 20260802000410_fix_rpc_partial_replacement_regression.sql (send_for_repair still raises)
--   warehouse_transfers header           <- baseline_schema.sql + 20260802000300 (kind columns)
--   warehouse_transfer_items normalized  <- baseline_schema.sql (create_transfer_v2 uses both)
--   generate_transfer_number()           <- baseline_schema.sql (returns 'WT-YYYY-NNNNN')
--
-- Corrections vs. the plan's illustrative SQL (Task 5 in the plan doc):
--   - Plan uses public._next_transfer_number('SFR'); the real helper is
--     public.generate_transfer_number() with no argument. Reuse that — no
--     new prefix scheme this phase (kind is already the discriminator).
--   - Plan writes ONE items jsonb row on warehouse_transfers.items but the
--     real transfer model uses a normalized warehouse_transfer_items child
--     row per line (see create_transfer_v2). Emit the child row too so the
--     Damaged Stock overview + existing transfers list read the same shape.
--   - Plan raises "not yet implemented" in the dispatcher branches; we
--     replace both with a real dispatch to _record_inventory_disposition
--     (mirrors how restock_as_damaged was handled in 9.3).
--   - Plan proposes a v_line_unit_cost declaration inside
--     rpc_send_damaged_for_repair without declaring it in DECLARE — added.

-- ─── 0. Relax the link-matches-type constraint for send_for_repair ────────
-- 9.3's version required warehouse_transfer_id NOT NULL for send_for_repair,
-- which blocks the two-step UX (disposition first, then transfer). Relax it
-- so send_for_repair allows warehouse_transfer_id null at creation time and
-- non-null after rpc_send_damaged_for_repair links it. inventory_stock_movement_id
-- must still be null (send_for_repair never books an inventory_stock_movements row —
-- the damaged-side ledger is the only audit surface).

alter table public.return_line_inventory_dispositions
  drop constraint if exists return_line_inventory_dispositions_link_matches_type;

alter table public.return_line_inventory_dispositions
  add constraint return_line_inventory_dispositions_link_matches_type check (
    case disposition_type
      when 'write_off'           then inventory_stock_movement_id is not null and warehouse_transfer_id is null
      when 'restock_as_damaged'  then inventory_stock_movement_id is null     and warehouse_transfer_id is null
      when 'send_for_repair'     then inventory_stock_movement_id is null
    end
  );

-- ─── 1. Helper: _consume_damaged_stock_fifo ──────────────────────────────
-- Walks inventory_damaged_stock_layers in insertion order, decrementing
-- qty_remaining across as many layers as needed to cover p_qty, then updates
-- the aggregate inventory_damaged_stock row. Raises if the aggregate is short.

create or replace function public._consume_damaged_stock_fifo(
  p_warehouse_id     uuid,
  p_brand_variant_id uuid,
  p_qty              numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needed numeric := p_qty;
  v_layer  record;
  v_take   numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception '_consume_damaged_stock_fifo: qty must be > 0 (got %)', p_qty;
  end if;

  for v_layer in
    select id, qty_remaining
      from public.inventory_damaged_stock_layers
     where warehouse_id = p_warehouse_id
       and brand_variant_id = p_brand_variant_id
       and qty_remaining > 0
     order by layered_at, id
    for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_layer.qty_remaining);
    update public.inventory_damaged_stock_layers
       set qty_remaining = qty_remaining - v_take
     where id = v_layer.id;
    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception '_consume_damaged_stock_fifo: insufficient damaged stock at % / % (short by %)',
      p_warehouse_id, p_brand_variant_id, v_needed;
  end if;

  update public.inventory_damaged_stock
     set qty = qty - p_qty,
         updated_at = now()
   where warehouse_id = p_warehouse_id
     and brand_variant_id = p_brand_variant_id;

  if not found then
    raise exception '_consume_damaged_stock_fifo: aggregate row missing at % / %', p_warehouse_id, p_brand_variant_id;
  end if;
end;
$$;

revoke execute on function public._consume_damaged_stock_fifo(uuid, uuid, numeric) from public;
grant  execute on function public._consume_damaged_stock_fifo(uuid, uuid, numeric) to service_role;

comment on function public._consume_damaged_stock_fifo is
  'Internal. Consumes p_qty of damaged stock from inventory_damaged_stock_layers (FIFO by layered_at) and decrements the aggregate inventory_damaged_stock row. Raises if the layer set cannot cover p_qty. Callers must have already verified sufficient qty exists.';

-- ─── 2. rpc_send_damaged_for_repair ──────────────────────────────────────
-- Follow-up RPC called after a send_for_repair disposition has been recorded.
-- Takes the disposition id + vendor + warehouse + expected return date and
-- (a) restocks into damaged stock if the units aren't there yet, (b) consumes
-- from damaged FIFO, (c) creates the outbound damaged_repair_out transfer with
-- warehouse_transfer_items child row, (d) emits the send_for_repair_out
-- damaged-movement, (e) links disposition -> transfer.

create or replace function public.rpc_send_damaged_for_repair(
  p_return_line_disposition_id uuid,
  p_repair_vendor_id           uuid,
  p_warehouse_id               uuid,
  p_expected_return_date       date,
  p_notes                      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp             record;
  v_return_line      record;
  v_vendor           record;
  v_transfer_id      uuid;
  v_transfer_number  text;
  v_unit_cost        numeric;
  v_current_damaged  numeric;
begin
  -- ─ Validation ────────────────────────────────────────────────────────
  select id, return_line_id, disposition_type, qty, warehouse_transfer_id
    into v_disp
    from public.return_line_inventory_dispositions
    where id = p_return_line_disposition_id
    for update;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: disposition % not found', p_return_line_disposition_id;
  end if;
  if v_disp.disposition_type <> 'send_for_repair' then
    raise exception 'rpc_send_damaged_for_repair: disposition % is % (expected send_for_repair)',
      p_return_line_disposition_id, v_disp.disposition_type;
  end if;
  if v_disp.warehouse_transfer_id is not null then
    raise exception 'rpc_send_damaged_for_repair: disposition % already linked to transfer %',
      p_return_line_disposition_id, v_disp.warehouse_transfer_id;
  end if;

  select id, virtual_warehouse_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no virtual warehouse (trigger misfire?)', p_repair_vendor_id;
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'rpc_send_damaged_for_repair: warehouse % not found', p_warehouse_id;
  end if;
  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  -- ─ Look up the return-line context for cost basis + variant ──────────
  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  -- ─ Ensure the units are in damaged stock (implicit restock) ──────────
  -- Two paths reach here:
  --   (1) Operator did restock_as_damaged first, then send_for_repair as a
  --       follow-up on the remaining qty — damaged stock already has qty.
  --   (2) Operator went straight from a damaged return to send_for_repair.
  --       The disposition-creation step booked the row but did NO damaged-side
  --       side-effects (see the send_for_repair branch of _record_inventory_disposition
  --       below); the units must be laid in now.
  -- Distinguish by checking the aggregate row: if qty at (p_warehouse_id,
  -- brand_variant_id) is >= v_disp.qty we can skip the restock and go straight
  -- to FIFO consume.

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    -- Implicit restock leg — mirror the 9.3 shape exactly (FIFO layer +
    -- aggregate upsert + restock_as_damaged_in movement). The movement is
    -- attributed to THIS disposition so the audit trail links back correctly.
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, auth.uid());

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), auth.uid()
    );
  end if;

  -- ─ Create the outbound damaged_repair_out transfer header ─────────────
  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_return_line_disposition_id, p_expected_return_date,
    auth.uid(), auth.uid(), now()
  )
  returning id into v_transfer_id;

  -- ─ Normalized transfer item row (mirrors create_transfer_v2 pattern) ─
  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty
  ) values (
    v_transfer_id, v_return_line.brand_variant_id,
    coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
    v_disp.qty::integer, v_unit_cost, v_disp.qty::integer
  );

  -- ─ Consume from damaged-stock FIFO at the source warehouse ────────────
  perform public._consume_damaged_stock_fifo(p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty);

  -- ─ Damaged-side movement row ─────────────────────────────────────────
  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
    v_disp.id, v_transfer_id, p_notes, auth.uid()
  );

  -- ─ Link disposition -> transfer ──────────────────────────────────────
  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$$;

grant execute on function public.rpc_send_damaged_for_repair(uuid, uuid, uuid, date, text)
  to authenticated, service_role;

comment on function public.rpc_send_damaged_for_repair is
  'Follow-up RPC after a send_for_repair disposition. Creates a warehouse_transfers row (transfer_kind=damaged_repair_out) targeting the repair vendor virtual warehouse, restocks-as-damaged first if the units are not already in damaged stock, consumes from damaged-stock FIFO, emits the send_for_repair_out movement, and links the disposition to the transfer.';

-- ─── 3. _record_inventory_disposition — extend for send_for_repair ───────
-- Adds a send_for_repair branch that guards p_warehouse_id (required — the
-- follow-up RPC needs it to know where the damaged stock will be sourced from,
-- and rpc_send_damaged_for_repair reads it back from its own param, but the
-- guard here catches the "dispatcher forgot to pass p_warehouse_id" bug at
-- disposition-creation time rather than at rpc_send_damaged_for_repair time).
-- No damaged-side side-effects fire from _record_inventory_disposition for
-- send_for_repair — those happen when the operator picks a vendor.
--
-- Body reproduced verbatim from 20260802000400 except for the new guard clause
-- and the additional branch note in the comment.

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
  if p_disposition_type = 'send_for_repair' and p_warehouse_id is null then
    raise exception '_record_inventory_disposition: p_warehouse_id is required for send_for_repair (needed by rpc_send_damaged_for_repair follow-up)';
  end if;

  insert into public.return_line_inventory_dispositions (
    return_line_id, disposition_type, qty,
    inventory_stock_movement_id, warehouse_transfer_id, notes, created_by
  ) values (
    p_return_line_id, p_disposition_type, p_qty,
    p_inventory_stock_movement_id, p_warehouse_transfer_id, p_notes, auth.uid()
  ) returning id into v_new_id;

  if p_disposition_type = 'restock_as_damaged' then
    v_unit_cost := public._return_line_fifo_unit_cost(v_return_id, p_return_line_id, p_qty);

    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, auth.uid());

    insert into public.inventory_damaged_stock (warehouse_id, brand_variant_id, qty, weighted_unit_cost)
    values (p_warehouse_id, v_brand_variant, p_qty, v_unit_cost)
    on conflict (warehouse_id, brand_variant_id) do update
      set qty = inventory_damaged_stock.qty + excluded.qty,
          weighted_unit_cost = (
            (inventory_damaged_stock.qty * inventory_damaged_stock.weighted_unit_cost)
            + (excluded.qty * excluded.weighted_unit_cost)
          ) / (inventory_damaged_stock.qty + excluded.qty),
          updated_at = now();

    insert into public.inventory_damaged_movements
      (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
       source_return_line_disposition_id, notes, created_by)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, auth.uid()
    );
  end if;

  -- send_for_repair: no side-effects here — rpc_send_damaged_for_repair does
  -- them once the vendor is picked. The disposition row exists so the return's
  -- inventory dimension sees the qty as "resolved" (send_for_repair covers the
  -- inventory ledger regardless of when the physical transfer actually leaves).

  return v_new_id;
end;
$$;

revoke execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text,uuid) from public;
grant  execute on function public._record_inventory_disposition(uuid,text,numeric,uuid,uuid,text,uuid) to service_role;

comment on function public._record_inventory_disposition is
  'Internal. Inserts one row in return_line_inventory_dispositions after validating (a) return_line is damaged and (b) qty <= inventory_remaining_qty. For disposition_type=restock_as_damaged also books a FIFO layer + aggregate upsert + movement row into the damaged-stock tables (p_warehouse_id required). For disposition_type=send_for_repair records the row only; damaged-side side-effects fire in rpc_send_damaged_for_repair when the operator picks a vendor (p_warehouse_id still required so the follow-up RPC knows where to source from).';

-- ─── 4. rpc_record_inventory_disposition — dispatch send_for_repair ──────
-- Body reproduced verbatim from 20260802000400 except the send_for_repair
-- branch now dispatches to _record_inventory_disposition instead of raising.

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
      if not exists (
        select 1 from public.return_lines rl
        where rl.id = v_disp_line_id and rl.return_id = p_return_id
      ) then
        raise exception 'rpc_record_inventory_disposition: return_line % not found on return %', v_disp_line_id, p_return_id;
      end if;

      perform public._record_inventory_disposition(
        p_return_line_id   => v_disp_line_id,
        p_disposition_type => 'send_for_repair',
        p_qty              => v_disp_qty,
        p_notes            => v_disp->>'notes',
        p_warehouse_id     => p_warehouse_id
      );

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
  'After-the-fact inventory disposition for damaged returns. Iterates p_dispositions and books an inventory_stock_movements row + disposition row for write_off; a damaged-stock FIFO layer/aggregate/movement + disposition row for restock_as_damaged; or a disposition row only for send_for_repair (transfer creation deferred to rpc_send_damaged_for_repair after the operator picks a vendor). Closes the return if both ledgers cover.';

-- ─── 5. rpc_create_partial_replacement — dispatch send_for_repair ────────
-- Body reproduced verbatim from 20260802000410 except the send_for_repair
-- branch now dispatches to _record_inventory_disposition instead of raising.

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
      delivery_number, sale_order_id, warehouse_id, date,
      status, type, return_id
    ) values (
      v_delivery_num, v_sale_order_id, p_warehouse_id, current_date,
      'delivered', 'replacement', p_return_id
    ) returning id into v_delivery_id;
  end if;

  -- 2. Iterate replacement lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id  := (v_line->>'return_line_id')::uuid;
    v_line_qty := (v_line->>'qty')::numeric;

    if v_line_qty is null or v_line_qty <= 0 then
      continue;
    end if;

    select rl.brand_variant_id, rl.item_name, rl.sku
      into v_return_line
      from public.return_lines rl
      where rl.id = v_line_id and rl.return_id = p_return_id;
    if v_return_line.item_name is null then
      raise exception 'rpc_create_partial_replacement: return_line % not found on return %', v_line_id, p_return_id;
    end if;

    insert into public.sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_delivery_id, v_return_line.brand_variant_id, v_return_line.item_name, v_return_line.sku,
      v_line_qty::integer
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
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) values (
      v_delivery_id, v_gift_variant, coalesce(v_gift_item.item_name, 'Gift'), v_gift_item.sku,
      v_gift_qty::integer
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
        perform public._record_inventory_disposition(
          p_return_line_id   => v_disp_line_id,
          p_disposition_type => 'send_for_repair',
          p_qty              => v_disp_qty,
          p_notes            => v_disp->>'notes',
          p_warehouse_id     => p_warehouse_id
        );

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
