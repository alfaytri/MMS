-- Custody accept — per-line shortfall disposition: WRITE OFF (shrinkage) or
-- GIVE BACK to the source warehouse.
--
-- Until now a short receipt was always written off. Operators need the choice:
-- a unit genuinely lost in transit is shrinkage, but a unit the warehouse never
-- actually handed over should return to its shelf, not vanish.
--
-- p_receipts[] gains an optional "shortfall_action" ∈ {'writeoff','restock'}
-- (default 'writeoff', so existing callers are unchanged):
--   • writeoff → transfer_shrinkage at source + stock_level − miss  (prior behavior)
--   • restock  → re-create the source FIFO layer the dispatch drained + transfer_in
--                at source; stock_level is untouched (the units never left total
--                inventory — dispatch skipped the decrement for in-transit units).
--
-- warehouse_transfer_items.returned_qty records the given-back quantity so the
-- transfer line reads received / shrinkage / returned unambiguously.

alter table public.warehouse_transfer_items
  add column if not exists returned_qty integer not null default 0;

create or replace function public.rpc_accept_custody_assign(
  p_transfer_id            uuid,
  p_receipts               jsonb,
  p_accepted_by_profile_id uuid default null,
  p_accepted_by_name       text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_transfer              record;
  v_dest_responsible      uuid;
  v_dest_responsible_name text;
  v_uid                   uuid := public._current_user_data_id();
  v_accepter              uuid := coalesce(p_accepted_by_profile_id, v_uid);
  v_item                  record;
  v_move                  record;
  v_receipt               jsonb;
  v_received_qty          int;
  v_shrinkage_reason      text;
  v_action                text;
  v_total_dispatched      numeric;
  v_total_short           numeric;
  v_line_writeoff         numeric;
  v_line_restock          numeric;
  v_remaining_recv        numeric;
  v_take                  numeric;
  v_miss                  numeric;
  v_touched_variants      uuid[] := '{}';
  v_variant               uuid;
begin
  if v_accepter is null then
    raise exception 'You need to be signed in to accept a custody assignment.';
  end if;

  select id, transfer_kind, status, to_warehouse_id, to_sub_container_id,
         from_warehouse_id, from_sub_container_id
    into v_transfer
    from public.warehouse_transfers
    where id = p_transfer_id
    for update;

  if not found then
    raise exception 'This custody assignment no longer exists.';
  end if;
  if v_transfer.transfer_kind <> 'custody_assign' then
    raise exception 'This transfer is not a custody assignment and cannot be accepted here.';
  end if;
  if v_transfer.status <> 'in_transit' then
    raise exception 'This custody assignment is already % — it can no longer be accepted.', v_transfer.status;
  end if;

  -- Permission: destination sub's responsible person, inventory_manager, or system admin.
  select sc.responsible_person_profile_id, u.full_name
    into v_dest_responsible, v_dest_responsible_name
    from public.warehouse_sub_containers sc
    left join public.user_data u on u.id = sc.responsible_person_profile_id
    where sc.id = v_transfer.to_sub_container_id;

  if v_dest_responsible is distinct from v_accepter
     and not public._has_custody_admin_role(v_accepter) then
    if v_dest_responsible is null then
      raise exception 'This custody sub-container has no responsible person set. Ask an inventory manager or an admin to accept it, or assign one in Master Data.';
    else
      raise exception 'Only % can accept this custody assignment.', v_dest_responsible_name;
    end if;
  end if;

  for v_item in
    select id, brand_variant_id, item_name, sku
    from   public.warehouse_transfer_items
    where  transfer_id = p_transfer_id
    order  by brand_variant_id
  loop
    -- Total actually dispatched for this variant = sum of its transfer_out layers.
    select coalesce(sum(abs(qty)), 0)
      into v_total_dispatched
      from public.inventory_stock_movements
      where reference_type   = 'transfer'
        and reference_id     = p_transfer_id
        and brand_variant_id = v_item.brand_variant_id
        and movement_type    = 'transfer_out';

    if v_total_dispatched <= 0 then
      continue;
    end if;

    -- Receipt for this line: received qty (default = full dispatched, clamped),
    -- disposition for any shortfall, and an optional shrinkage reason.
    select r into v_receipt
      from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb)) r
      where (r->>'transfer_item_id')::uuid = v_item.id
      limit 1;

    v_received_qty     := coalesce((v_receipt->>'received_qty')::int, v_total_dispatched::int);
    v_shrinkage_reason := coalesce(nullif(btrim(v_receipt->>'shrinkage_reason'), ''), 'missing');
    v_action           := lower(coalesce(nullif(btrim(v_receipt->>'shortfall_action'), ''), 'writeoff'));
    if v_action not in ('writeoff', 'restock') then
      v_action := 'writeoff';
    end if;
    if v_received_qty < 0 then v_received_qty := 0; end if;
    if v_received_qty > v_total_dispatched then v_received_qty := v_total_dispatched::int; end if;

    -- The whole line's shortfall follows the line's chosen disposition.
    v_total_short   := greatest(v_total_dispatched - v_received_qty, 0);
    v_line_writeoff := case when v_action = 'restock' then 0 else v_total_short end;
    v_line_restock  := case when v_action = 'restock' then v_total_short else 0 end;

    update public.warehouse_transfer_items
       set received_qty     = v_received_qty,
           shrinkage_qty    = v_line_writeoff::int,
           returned_qty     = v_line_restock::int,
           shrinkage_reason = case when v_line_writeoff > 0 then v_shrinkage_reason else null end
     where id = v_item.id;

    v_remaining_recv := v_received_qty;

    -- Walk the dispatch-side layers in FIFO order. Each splits into a received
    -- portion (→ destination fifo layer + transfer_in) and a missing portion,
    -- which is either written off (transfer_shrinkage at source) or given back
    -- (re-created source fifo layer + transfer_in at source). No early exit —
    -- layers past the received qty are fully short and must still be recorded.
    for v_move in
      select qty, unit_cost
      from   public.inventory_stock_movements
      where  reference_type   = 'transfer'
        and  reference_id     = p_transfer_id
        and  brand_variant_id = v_item.brand_variant_id
        and  movement_type    = 'transfer_out'
      order  by created_at asc, id asc
    loop
      v_take := least(v_remaining_recv, abs(v_move.qty));
      v_miss := abs(v_move.qty) - v_take;

      if v_take > 0 then
        insert into public.fifo_cost_layers (
          brand_variant_id, warehouse_id, sub_container_id, date,
          qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
          source_type, source_id
        ) values (
          v_item.brand_variant_id, v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, current_date,
          v_take, v_move.unit_cost, 0, v_move.unit_cost, v_take,
          'custody_assign', p_transfer_id
        );

        insert into public.inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id,
          item_name, sku, movement_type, qty, unit_cost,
          reference_type, reference_id
        ) values (
          v_transfer.to_warehouse_id, v_transfer.to_sub_container_id, v_item.brand_variant_id,
          coalesce(v_item.item_name, ''), v_item.sku,
          'transfer_in', v_take, v_move.unit_cost,
          'transfer', p_transfer_id
        );
      end if;

      if v_miss > 0 then
        if v_action = 'restock' then
          -- Give the missing units back to the SOURCE shelf: re-create the FIFO
          -- layer the dispatch drained (same cost) and log a transfer_in there.
          -- stock_level is untouched — these units never left total inventory.
          insert into public.fifo_cost_layers (
            brand_variant_id, warehouse_id, sub_container_id, date,
            qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
            source_type, source_id
          ) values (
            v_item.brand_variant_id, v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, current_date,
            v_miss, v_move.unit_cost, 0, v_move.unit_cost, v_miss,
            'custody_return', p_transfer_id
          );

          insert into public.inventory_stock_movements (
            warehouse_id, sub_container_id, brand_variant_id,
            item_name, sku, movement_type, qty, unit_cost,
            reference_type, reference_id, notes
          ) values (
            v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, v_item.brand_variant_id,
            coalesce(v_item.item_name, ''), v_item.sku,
            'transfer_in', v_miss, v_move.unit_cost,
            'transfer', p_transfer_id, 'Returned to source (not received)'
          );
        else
          -- Write off the missing units as shrinkage at the source.
          insert into public.inventory_stock_movements (
            warehouse_id, sub_container_id, brand_variant_id,
            item_name, sku, movement_type, qty, unit_cost,
            reference_type, reference_id, notes
          ) values (
            v_transfer.from_warehouse_id, v_transfer.from_sub_container_id, v_item.brand_variant_id,
            coalesce(v_item.item_name, ''), v_item.sku,
            'transfer_shrinkage', -v_miss, v_move.unit_cost,
            'transfer', p_transfer_id, 'Shrinkage: ' || v_shrinkage_reason
          );
        end if;
      end if;

      v_remaining_recv := v_remaining_recv - v_take;
    end loop;

    -- Only a write-off leaves total inventory. Dispatch skipped the stock_level
    -- decrement for in-transit units; the received portion doesn't bring it back,
    -- and a restock keeps it (re-added to the source FIFO above). So decrement
    -- exactly the written-off quantity here.
    if v_line_writeoff > 0 then
      update public.inventory_item_brand_variants
         set stock_level = greatest(stock_level - v_line_writeoff, 0),
             updated_at  = now()
       where id = v_item.brand_variant_id;
    end if;

    v_touched_variants := v_touched_variants || v_item.brand_variant_id;
  end loop;

  update public.warehouse_transfers
     set status                 = 'received',
         received_by_profile_id = v_accepter,
         received_by_name       = p_accepted_by_name,
         received_at            = now()
   where id = p_transfer_id;

  -- Recost every touched variant (dest layer added, and/or source layer restored).
  select array(select distinct unnest(v_touched_variants)) into v_touched_variants;
  foreach v_variant in array v_touched_variants loop
    perform public.recalc_average_cost(v_variant);
  end loop;
end;
$function$;
