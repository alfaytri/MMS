-- Phase 3a Task 3: reverse the sale COGS when a returned unit is sent to
-- repair (leaves sold state). Body verbatim + one PERFORM. Return-from-repair
-- is untouched (repaired good re-enters at original+repair cost, expensed only
-- on resale -> no double count).
CREATE OR REPLACE FUNCTION public.rpc_send_damaged_for_repair(p_return_line_disposition_id uuid, p_repair_vendor_id uuid, p_warehouse_id uuid, p_expected_return_date date, p_notes text DEFAULT NULL::text, p_source_division_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_disp                  record;
  v_return_line           record;
  v_return                record;
  v_vendor                record;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_sub_ct                int;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
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

  select id, virtual_warehouse_id, sub_container_id, is_active, name
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
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_for_repair: repair vendor % has no sub_container_id (D.6.b backfill missed?)', p_repair_vendor_id;
  end if;

  select rl.brand_variant_id, rl.return_id, rl.item_name, rl.sku
    into v_return_line
    from public.return_lines rl
    where rl.id = v_disp.return_line_id;
  if not found then
    raise exception 'rpc_send_damaged_for_repair: return_line % not found', v_disp.return_line_id;
  end if;

  select r.division_id, r.source_type, r.source_id
    into v_return
    from public.so_po_returns r
    where r.id = v_return_line.return_id;

  -- Phase 3a: the unit leaves "sold" state here (returned -> sent to repair), so
  -- reverse the original sale COGS (full-line reversal). No-op for non-sale
  -- returns. The already-linked guard above ensures this runs once per
  -- disposition; rpc_return_damaged_from_repair does NOT re-reverse (no double).
  perform public._reverse_sale_cogs_for_return(v_return_line.return_id, v_return_line.brand_variant_id, v_disp.qty);

  -- Cascade: explicit override → return → parent SO/PO → cogs_entries → single sub.
  v_source_division := p_source_division_id;

  if v_source_division is null then
    v_source_division := v_return.division_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select so.division_id
      into v_source_division
      from public.sale_orders so
      where so.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'purchase_order' then
    select po.division_id
      into v_source_division
      from public.purchase_orders po
      where po.id = v_return.source_id;
  end if;

  if v_source_division is null and v_return.source_type = 'sale_order' then
    select ce.division_id
      into v_source_division
      from public.cogs_entries ce
      where ce.sale_order_id = v_return.source_id
        and ce.division_id is not null
      order by ce.date asc, ce.created_at asc
      limit 1;
  end if;

  if v_source_division is null then
    select count(*)
      into v_sub_ct
      from public.warehouse_sub_containers wsc
      where wsc.warehouse_id = p_warehouse_id;

    if v_sub_ct = 1 then
      select wsc.division_id
        into v_source_division
        from public.warehouse_sub_containers wsc
        where wsc.warehouse_id = p_warehouse_id
        limit 1;
    end if;
  end if;

  if v_source_division is null then
    raise exception 'rpc_send_damaged_for_repair: cannot derive source division. Return %/% has no division_id, parent %/% has no division_id, no cogs_entries division stamped, and warehouse % has % sub-containers. Pass p_source_division_id explicitly.',
      v_return.source_type, v_return_line.return_id,
      v_return.source_type, v_return.source_id,
      p_warehouse_id, v_sub_ct;
  end if;

  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  v_unit_cost := public._return_line_fifo_unit_cost(v_return_line.return_id, v_disp.return_line_id, v_disp.qty);

  select coalesce(qty, 0)
    into v_current_damaged
    from public.inventory_damaged_stock
    where warehouse_id = p_warehouse_id
      and brand_variant_id = v_return_line.brand_variant_id;

  if coalesce(v_current_damaged, 0) < v_disp.qty then
    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by)
    values
      (p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty, v_disp.qty, v_unit_cost, v_disp.return_line_id, v_uid);

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
      v_disp.id, coalesce(p_notes, 'Implicit restock-as-damaged before send-for-repair'), v_uid
    );
  end if;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_source_division);
  v_to_sub_container_id   := v_vendor.sub_container_id;

  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, v_vendor.virtual_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_return_line_disposition_id, p_expected_return_date,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, v_return_line.brand_variant_id,
    coalesce(v_return_line.item_name, ''), nullif(v_return_line.sku, ''),
    v_disp.qty::integer, v_unit_cost, v_disp.qty::integer,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, v_return_line.brand_variant_id, v_disp.qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', v_disp.qty, p_warehouse_id, v_return_line.brand_variant_id, v_unit_cost,
    v_disp.id, v_transfer_id, p_notes, v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$function$;

NOTIFY pgrst, 'reload schema';
