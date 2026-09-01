-- 20261049000000_dedup_send_for_repair.sql  (Phase 3, Task 4)
--
-- De-duplicate the two send-for-repair RPCs by extracting their ~40-line shared
-- tail (create the damaged_repair_out transfer + its item, consume the damaged
-- pile FIFO, post the send_for_repair_out movement) into ONE private helper,
-- _emit_send_for_repair_transfer. Both RPCs keep their DISTINCT guards + entry
-- logic (the disposition path: COGS reversal, division cascade, return-line FIFO
-- cost, implicit restock, disposition linking; the ad-hoc path: qty/pile checks)
-- — only the common tail is shared. No behavior change: the helper reproduces
-- each original insert/consume exactly (source_return_line_disposition_id and
-- the movement notes are parameterised to preserve the per-path values).
--
-- The helper is SECURITY DEFINER but EXECUTE is revoked from PUBLIC so it is NOT
-- an independently callable path (only the two SECURITY DEFINER RPCs, which run
-- as the owner, can reach it). Full CREATE OR REPLACE of both RPCs (verified
-- byte-identical staging=prod before apply).

-- ── shared tail ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._emit_send_for_repair_transfer(
  p_warehouse_id           uuid,
  p_to_warehouse_id        uuid,
  p_brand_variant_id       uuid,
  p_qty                    numeric,
  p_unit_cost              numeric,
  p_item_name              text,
  p_sku                    text,
  p_from_sub_container_id  uuid,
  p_to_sub_container_id    uuid,
  p_repair_vendor_id       uuid,
  p_expected_return_date   date,
  p_notes                  text,
  p_disposition_id         uuid,
  p_movement_notes         text,
  p_uid                    uuid
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  v_transfer_id     uuid;
  v_transfer_number text;
begin
  v_transfer_number := public.generate_transfer_number();

  insert into public.warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    transfer_kind, repair_vendor_id, source_return_line_disposition_id, expected_return_date,
    from_sub_container_id, to_sub_container_id,
    created_by_profile_id, dispatched_by_profile_id, dispatched_at
  ) values (
    v_transfer_number, p_warehouse_id, p_to_warehouse_id,
    'in_transit', current_date, p_notes,
    'damaged_repair_out', p_repair_vendor_id, p_disposition_id, p_expected_return_date,
    p_from_sub_container_id, p_to_sub_container_id,
    p_uid, p_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, p_brand_variant_id,
    coalesce(p_item_name, ''), nullif(p_sku, ''),
    p_qty::integer, p_unit_cost, p_qty::integer,
    p_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, p_brand_variant_id, p_qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_return_line_disposition_id, source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', p_qty, p_warehouse_id, p_brand_variant_id, p_unit_cost,
    p_disposition_id, v_transfer_id, p_movement_notes, p_uid
  );

  return v_transfer_id;
end;
$fn$;

REVOKE EXECUTE ON FUNCTION public._emit_send_for_repair_transfer(
  uuid, uuid, uuid, numeric, numeric, text, text, uuid, uuid, uuid, date, text, uuid, text, uuid
) FROM PUBLIC;

-- ── ad-hoc entry (existing on-hand damaged stock) ───────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_send_damaged_stock_for_repair(p_warehouse_id uuid, p_brand_variant_id uuid, p_qty integer, p_repair_vendor_id uuid, p_expected_return_date date, p_source_division_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vendor                record;
  v_available             numeric;
  v_unit_cost             numeric;
  v_item_name             text;
  v_item_sku              text;
  v_from_sub_container_id uuid;
  v_uid                   uuid := public._current_user_data_id();
begin IF NOT public._auth_user_has_permission('damaged_stock.on_hand.edit') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  if p_qty is null or p_qty <= 0 then
    raise exception 'rpc_send_damaged_stock_for_repair: qty must be > 0 (got %)', p_qty;
  end if;
  if p_source_division_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: source_division_id is required — pick one on the dialog';
  end if;

  select id, virtual_warehouse_id, sub_container_id, is_active, name
    into v_vendor
    from public.repair_vendors
    where id = p_repair_vendor_id;
  if not found then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % not found', p_repair_vendor_id;
  end if;
  if not v_vendor.is_active then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % is inactive', p_repair_vendor_id;
  end if;
  if v_vendor.virtual_warehouse_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no virtual warehouse', p_repair_vendor_id;
  end if;
  if v_vendor.sub_container_id is null then
    raise exception 'rpc_send_damaged_stock_for_repair: repair vendor % has no sub_container_id', p_repair_vendor_id;
  end if;
  if p_warehouse_id = v_vendor.virtual_warehouse_id then
    raise exception 'rpc_send_damaged_stock_for_repair: source warehouse cannot be the vendor virtual warehouse';
  end if;

  select coalesce(qty, 0), coalesce(weighted_unit_cost, 0)
    into v_available, v_unit_cost
    from public.inventory_damaged_stock
    where warehouse_id     = p_warehouse_id
      and brand_variant_id = p_brand_variant_id;

  if coalesce(v_available, 0) < p_qty then
    raise exception 'rpc_send_damaged_stock_for_repair: damaged pile at % / % is short (available %, requested %)',
      p_warehouse_id, p_brand_variant_id, coalesce(v_available, 0), p_qty;
  end if;

  -- Human-readable labels for the transfer_item row.
  select coalesce(ii.name_en, ''), coalesce(ii.sku, '')
    into v_item_name, v_item_sku
    from public.inventory_item_brand_variants bv
    left join public.inventory_items ii on ii.id = bv.item_id
    where bv.id = p_brand_variant_id;

  v_from_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, p_source_division_id);

  return public._emit_send_for_repair_transfer(
    p_warehouse_id, v_vendor.virtual_warehouse_id, p_brand_variant_id, p_qty::numeric,
    v_unit_cost, v_item_name, v_item_sku,
    v_from_sub_container_id, v_vendor.sub_container_id,
    p_repair_vendor_id, p_expected_return_date, p_notes,
    NULL::uuid,
    coalesce(p_notes, 'Ad-hoc send-for-repair from Damaged Stock On-hand'),
    v_uid
  );
end;
$function$;

-- ── disposition entry (from a return's send_for_repair disposition) ──────────
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
  v_unit_cost             numeric;
  v_current_damaged       numeric;
  v_source_division       uuid;
  v_sub_ct                int;
  v_from_sub_container_id uuid;
  v_uid                   uuid := public._current_user_data_id();
begin IF NOT public._auth_user_has_permission('damaged_stock.out_for_repair.edit') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
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

  v_transfer_id := public._emit_send_for_repair_transfer(
    p_warehouse_id, v_vendor.virtual_warehouse_id, v_return_line.brand_variant_id, v_disp.qty,
    v_unit_cost, v_return_line.item_name, v_return_line.sku,
    v_from_sub_container_id, v_vendor.sub_container_id,
    p_repair_vendor_id, p_expected_return_date, p_notes,
    v_disp.id,
    p_notes,
    v_uid
  );

  update public.return_line_inventory_dispositions
     set warehouse_transfer_id = v_transfer_id
   where id = p_return_line_disposition_id;

  return v_transfer_id;
end;
$function$;

NOTIFY pgrst, 'reload schema';
