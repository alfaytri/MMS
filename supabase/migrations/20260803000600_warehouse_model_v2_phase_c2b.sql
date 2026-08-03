-- Warehouse Model v2 — Phase C.2.b: sub-container population in
-- receival + return-restock RPCs.
--
-- Live-body archaeology per feedback_rewrite_functions_from_live_db:
--   create_and_approve_receival <- 20260729214710_fx_receival_qar_conversion.sql
--   rpc_process_return_restock  <- 20260730000500_fix_write_off_double_movement.sql
--
-- Only changes vs live bodies:
--   1. Resolve v_division_id from the parent entity (purchase_orders /
--      so_po_returns).
--   2. Resolve v_sub_container_id once per call via
--      public._find_or_create_sub_container(warehouse_id, division_id).
--   3. Stamp sub_container_id on every stock-row INSERT — fifo_cost_layers,
--      inventory_stock_movements, and (receival only) receival_items.
--
-- The BEFORE trigger _sync_division_from_sub_container installed in
-- 20260803000500_warehouse_model_v2_phase_c2a.sql back-fills division_id
-- from sub_container_id automatically, so we don't need to touch the
-- existing division_id column values.

BEGIN;

-- ─── 1. create_and_approve_receival ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_and_approve_receival(
  p_po_id uuid,
  p_warehouse_id uuid,
  p_date date,
  p_received_by_name text,
  p_receival_number text,
  p_notes text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receival_id       UUID;
  v_receival_number   TEXT;
  v_item              JSONB;
  v_bv_id             UUID;
  v_bv_ids            UUID[] := '{}';
  v_bv_id_elem        UUID;
  v_qty               INT;
  v_cost              NUMERIC;
  v_cost_qar          NUMERIC;
  v_pli_id            UUID;
  v_po_currency       TEXT;
  v_po_rate           NUMERIC;
  v_division_id       UUID;
  v_sub_container_id  UUID;
BEGIN
  -- Read PO's currency + booked rate + division once per receival
  SELECT COALESCE(currency, 'QAR'), COALESCE(initial_exchange_rate, 1), division_id
    INTO v_po_currency, v_po_rate, v_division_id
    FROM public.purchase_orders
   WHERE id = p_po_id;

  -- Resolve sub-container for (warehouse, division) once per receival
  v_sub_container_id := public._find_or_create_sub_container(p_warehouse_id, v_division_id);

  IF p_receival_number IS NULL OR p_receival_number = '' THEN
    v_receival_number := 'RCV-' || lpad(nextval('receival_number_seq')::TEXT, 5, '0');
  ELSE
    v_receival_number := p_receival_number;
  END IF;

  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    v_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN (v_item->>'qty_received') IS NULL OR (v_item->>'unit_cost') IS NULL;

    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    -- Convert to QAR for inventory-valuation rows; receival_items keeps original
    v_cost_qar := v_cost * v_po_rate;

    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free,
      sub_container_id
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false),
      v_sub_container_id
    );

    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
      source_currency, source_exchange_rate,
      sub_container_id
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id, v_receival_number,
      p_date, v_qty, v_cost_qar, 0, v_cost_qar, v_qty,
      v_po_currency, v_po_rate,
      v_sub_container_id
    );

    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id,
      sub_container_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost_qar,
      'receival', v_receival_id,
      v_sub_container_id
    );

    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  PERFORM refresh_po_status(p_po_id);

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', v_receival_number);
END;
$$;

-- ─── 2. rpc_process_return_restock ──────────────────────────────────────
create or replace function public.rpc_process_return_restock(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_return            record;
  v_line              record;
  v_cogs              record;
  v_qty_remaining     int;
  v_qty_this_chunk    numeric;
  v_available_qty     numeric;
  v_pending_insp      int;
  v_sub_container_id  uuid;
begin
  select id, source_type, source_id, restock_warehouse_id,
         status, restocked_at, return_number, division_id
  into   v_return
  from   so_po_returns
  where  id = p_return_id
  for update;

  if not found then
    raise exception 'Return % not found', p_return_id;
  end if;

  if v_return.restocked_at is not null then
    return;
  end if;

  if v_return.status <> 'restocked' then
    raise exception 'Return must have status=restocked before processing inventory (got %)', v_return.status;
  end if;

  if v_return.source_type <> 'sale_order' then
    raise exception 'rpc_process_return_restock: expected source_type=sale_order, got %', v_return.source_type;
  end if;

  if v_return.restock_warehouse_id is null then
    raise exception 'Return % has no restock_warehouse_id set', p_return_id;
  end if;

  select count(*)
  into   v_pending_insp
  from   return_lines
  where  return_id = p_return_id
    and  condition = 'inspection';

  if v_pending_insp > 0 then
    raise exception 'Return % has % line(s) awaiting inspection — call rpc_complete_return_inspection before restocking',
      v_return.return_number, v_pending_insp;
  end if;

  -- Resolve sub-container for (restock_warehouse, division) once per return
  v_sub_container_id := public._find_or_create_sub_container(
    v_return.restock_warehouse_id,
    v_return.division_id
  );

  -- Phase 7: iterate GOOD lines only. Damaged lines wait for an explicit
  -- disposition action (write_off / restock_as_damaged / send_for_repair) and
  -- their inventory movements are booked there, not here.
  for v_line in
    select id, brand_variant_id, item_name, sku, qty, condition, condition_notes
    from   return_lines
    where  return_id = p_return_id
      and  brand_variant_id is not null
      and  qty > 0
      and  condition = 'good'
  loop
    select coalesce(sum(qty), 0)
    into   v_available_qty
    from   cogs_entries
    where  sale_order_id = v_return.source_id
      and  brand_variant_id = v_line.brand_variant_id
      and  qty > 0;

    if v_available_qty < v_line.qty then
      raise exception 'Return line % (variant %) requests qty % but only % available in cogs_entries for sale_order %',
        v_line.id, v_line.brand_variant_id, v_line.qty, v_available_qty, v_return.source_id;
    end if;

    v_qty_remaining := v_line.qty;

    for v_cogs in
      select id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id, date
      from   cogs_entries
      where  sale_order_id = v_return.source_id
        and  brand_variant_id = v_line.brand_variant_id
        and  qty > 0
      order  by date asc, unit_cost asc, id asc
    loop
      exit when v_qty_remaining <= 0;

      v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

      insert into fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,
        source_type, source_id, division_id,
        sub_container_id
      ) values (
        v_line.brand_variant_id,
        v_return.restock_warehouse_id,
        current_date,
        v_qty_this_chunk,
        v_cogs.unit_cost,
        0,
        v_cogs.unit_cost,
        v_qty_this_chunk,
        'sale_return',
        p_return_id,
        v_return.division_id,
        v_sub_container_id
      );

      insert into cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id,
        qty, unit_cost, total_cost, date,
        source_type, division_id, notes
      ) values (
        v_line.brand_variant_id,
        v_cogs.sale_delivery_id,
        v_cogs.sale_order_id,
        -v_qty_this_chunk,
        v_cogs.unit_cost,
        -(v_qty_this_chunk * v_cogs.unit_cost),
        current_date,
        'sale_return',
        v_return.division_id,
        'Reversed by return ' || v_return.return_number
      );

      insert into inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost,
        reference_type, reference_id, notes,
        sub_container_id
      ) values (
        v_return.restock_warehouse_id,
        v_line.brand_variant_id,
        v_line.item_name,
        nullif(v_line.sku, ''),
        'sale_return',
        v_qty_this_chunk,
        v_cogs.unit_cost,
        'return',
        p_return_id,
        'Sale return restocked (good) — ' || v_return.return_number,
        v_sub_container_id
      );

      v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
    end loop;

    if v_qty_remaining > 0 then
      raise exception 'Return line % (variant %) could not be fully attributed: % units unmatched',
        v_line.id, v_line.brand_variant_id, v_qty_remaining;
    end if;

    update inventory_item_brand_variants
    set    stock_level = stock_level + v_line.qty,
           updated_at  = now()
    where  id = v_line.brand_variant_id;

    perform recalc_average_cost(v_line.brand_variant_id);
  end loop;

  update so_po_returns
  set    restocked_at = now()
  where  id = p_return_id;
end;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
