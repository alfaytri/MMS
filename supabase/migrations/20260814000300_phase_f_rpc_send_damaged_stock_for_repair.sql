-- Warehouse Model v2 — Phase F, migration 3/3
--
-- `rpc_send_damaged_stock_for_repair` — ad-hoc send-for-repair from the
-- Damaged Stock On-hand tab. No disposition, no return_line context. The
-- operator picks a warehouse + variant + qty + vendor + source division
-- straight from the on-hand row.
--
-- Behavior mirrors `rpc_send_damaged_for_repair` (Phase E) but skips the
-- disposition-based side effects:
--   * No return_line_inventory_dispositions update.
--   * source_return_line_disposition_id on the new transfer + movement is NULL.
--   * No implicit restock-as-damaged branch — the caller guarantees the
--     damaged pile already has p_qty on hand (guarded here too).
--
-- Fires _consume_damaged_stock_fifo just like the original — the follow-up
-- #7 sync trigger keeps inventory_item_brand_variants.damaged_qty in step.

CREATE OR REPLACE FUNCTION public.rpc_send_damaged_stock_for_repair(
  p_warehouse_id         uuid,
  p_brand_variant_id     uuid,
  p_qty                  int,
  p_repair_vendor_id     uuid,
  p_expected_return_date date,
  p_source_division_id   uuid,
  p_notes                text DEFAULT NULL
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vendor                record;
  v_available             numeric;
  v_transfer_id           uuid;
  v_transfer_number       text;
  v_unit_cost             numeric;
  v_item_name             text;
  v_item_sku              text;
  v_from_sub_container_id uuid;
  v_to_sub_container_id   uuid;
  v_uid                   uuid := public._current_user_data_id();
begin
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
    'damaged_repair_out', p_repair_vendor_id, NULL, p_expected_return_date,
    v_from_sub_container_id, v_to_sub_container_id,
    v_uid, v_uid, now()
  )
  returning id into v_transfer_id;

  insert into public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost, dispatched_qty,
    sub_container_id
  ) values (
    v_transfer_id, p_brand_variant_id,
    v_item_name, nullif(v_item_sku, ''),
    p_qty, v_unit_cost, p_qty,
    v_from_sub_container_id
  );

  perform public._consume_damaged_stock_fifo(p_warehouse_id, p_brand_variant_id, p_qty);

  insert into public.inventory_damaged_movements
    (movement_type, qty, warehouse_id, brand_variant_id, unit_cost,
     source_transfer_id, notes, created_by)
  values (
    'send_for_repair_out', p_qty, p_warehouse_id, p_brand_variant_id, v_unit_cost,
    v_transfer_id,
    coalesce(p_notes, 'Ad-hoc send-for-repair from Damaged Stock On-hand'),
    v_uid
  );

  return v_transfer_id;
end;
$function$;

COMMENT ON FUNCTION public.rpc_send_damaged_stock_for_repair(uuid, uuid, int, uuid, date, uuid, text) IS
'Warehouse Model v2 Phase F. Ad-hoc send-for-repair from Damaged Stock On-hand
(no disposition, no return context). Creates a damaged_repair_out warehouse
transfer, consumes the damaged pile, logs a send_for_repair_out movement.
Return path (rpc_return_damaged_from_repair) already handles NULL disposition —
it only reads warehouse_transfers.from_sub_container_id.';
