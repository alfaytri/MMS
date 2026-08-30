-- Phase 3a Task 1: reverse sale COGS on restock-as-damaged (+ shared helper).
-- Phase 3a: shared "reverse the original sale COGS" for a return disposition.
-- Mirrors rpc_process_return_restock's negative-cogs loop (full-line reversal:
-- the negative cogs_entries reverses BOTH revenue and cost in rpc_report_pnl) but
-- WITHOUT re-layering FIFO -- damaged/scrapped/repaired units do not re-enter
-- sellable stock; the caller's disposition routes the physical cost. Sale-sourced
-- returns only (source_type='sale_order'); returns 0 (no-op) otherwise.
CREATE OR REPLACE FUNCTION public._reverse_sale_cogs_for_return(p_return_id uuid, p_brand_variant_id uuid, p_qty numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return          RECORD;
  v_cogs            RECORD;
  v_qty_remaining   numeric := p_qty;
  v_qty_this_chunk  numeric;
  v_available_qty   numeric;
  v_reversed_cost   numeric := 0;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN RETURN 0; END IF;

  SELECT id, source_type, source_id, division_id, return_number
  INTO   v_return
  FROM   public.so_po_returns
  WHERE  id = p_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % not found', p_return_id;
  END IF;

  -- Sales returns only in Phase 3a (consumption returns reuse this in Phase 3b).
  IF v_return.source_type <> 'sale_order' THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(qty), 0)
  INTO   v_available_qty
  FROM   public.cogs_entries
  WHERE  sale_order_id = v_return.source_id
    AND  brand_variant_id = p_brand_variant_id
    AND  source_type = 'sale'
    AND  qty > 0;

  IF v_available_qty < p_qty THEN
    RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % variant % requests qty % but only % sale COGS available',
      v_return.return_number, p_brand_variant_id, p_qty, v_available_qty;
  END IF;

  FOR v_cogs IN
    SELECT id, sale_delivery_id, sale_order_id, qty, unit_cost, division_id
    FROM   public.cogs_entries
    WHERE  sale_order_id = v_return.source_id
      AND  brand_variant_id = p_brand_variant_id
      AND  source_type = 'sale'
      AND  qty > 0
    ORDER  BY date ASC, unit_cost ASC, id ASC
  LOOP
    EXIT WHEN v_qty_remaining <= 0;
    v_qty_this_chunk := least(v_cogs.qty, v_qty_remaining);

    INSERT INTO public.cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date,
      source_type, division_id, notes
    ) VALUES (
      p_brand_variant_id, v_cogs.sale_delivery_id, v_cogs.sale_order_id,
      -v_qty_this_chunk, v_cogs.unit_cost, -(v_qty_this_chunk * v_cogs.unit_cost), current_date,
      'sale_return', COALESCE(v_return.division_id, v_cogs.division_id),
      'COGS reversed by return ' || v_return.return_number || ' (disposition)'
    );

    v_reversed_cost := v_reversed_cost + (v_qty_this_chunk * v_cogs.unit_cost);
    v_qty_remaining := v_qty_remaining - v_qty_this_chunk;
  END LOOP;

  IF v_qty_remaining > 0 THEN
    RAISE EXCEPTION '_reverse_sale_cogs_for_return: return % variant % could not fully attribute % units',
      v_return.return_number, p_brand_variant_id, v_qty_remaining;
  END IF;

  RETURN v_reversed_cost;
END;
$function$;
REVOKE ALL ON FUNCTION public._reverse_sale_cogs_for_return(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._reverse_sale_cogs_for_return(uuid,uuid,numeric) TO authenticated;

-- Wire the reversal into the restock_as_damaged branch (body verbatim + PERFORM).
CREATE OR REPLACE FUNCTION public._record_inventory_disposition(p_return_line_id uuid, p_disposition_type text, p_qty numeric, p_inventory_stock_movement_id uuid DEFAULT NULL::uuid, p_warehouse_transfer_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_condition     text;
  v_remaining     numeric;
  v_return_id     uuid;
  v_brand_variant uuid;
  v_unit_cost     numeric;
  v_new_id        uuid;
  v_division      uuid;
  v_uid           uuid := public._current_user_data_id();
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

    -- Division = the return's division (so a damaged restock attributes to it).
    select r.division_id into v_division from public.so_po_returns r where r.id = v_return_id;

    insert into public.inventory_damaged_stock_layers
      (warehouse_id, brand_variant_id, qty_received, qty_remaining, unit_cost, source_return_line_id, created_by, division_id)
    values (p_warehouse_id, v_brand_variant, p_qty, p_qty, v_unit_cost, p_return_line_id, v_uid, v_division);

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
       source_return_line_disposition_id, notes, created_by, division_id)
    values (
      'restock_as_damaged_in', p_qty, p_warehouse_id, v_brand_variant, v_unit_cost,
      v_new_id, p_notes, v_uid, v_division
    );

    -- Phase 3a: reverse the sale COGS for the disposed qty (full-line
    -- reversal; the cost moves from sold -> damaged asset). The helper
    -- no-ops for non-sale-sourced returns.
    perform public._reverse_sale_cogs_for_return(v_return_id, v_brand_variant, p_qty);
  end if;

  return v_new_id;
end;
$function$;

NOTIFY pgrst, 'reload schema';
