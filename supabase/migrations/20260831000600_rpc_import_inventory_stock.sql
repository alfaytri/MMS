-- Inventory importer (full rebuild): book opening stock from an Excel import.
-- The client creates the catalog (categories/items/variants) directly, but it
-- CANNOT insert fifo_cost_layers across divisions — the RESTRICTIVE
-- sub_container_scope_insert_r policy (is_sub_container_visible) blocks any
-- sub-container outside the caller's active division. This SECURITY DEFINER RPC
-- books the opening stock server-side (bypassing that scope) for any caller who
-- can manage the catalog. It inserts source_type='inventory_import' FIFO layers
-- (the trg_fifo_stock_summary / trg_autostick_item_division / fn_refresh_warehouse_stats
-- triggers fire) and then sets the variant/item caches those triggers don't touch.
-- Tools stay bulk (create_tool_units_on_receival_layer only fires on 'receival').
CREATE OR REPLACE FUNCTION public.rpc_import_inventory_stock(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := public._current_user_data_id();
  v_row      jsonb;
  v_bv       uuid;
  v_sub      uuid;
  v_qty      integer;
  v_cost     numeric;
  v_wh       uuid;
  v_layers   integer := 0;
  v_units    bigint := 0;
  v_value    numeric := 0;
  v_variants uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to import stock.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._user_has_permission(v_uid, 'inventory.catalog.manage') THEN
    RAISE EXCEPTION 'Missing permission: inventory.catalog.manage' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    v_bv   := (v_row->>'brand_variant_id')::uuid;
    v_sub  := (v_row->>'sub_container_id')::uuid;
    v_qty  := (v_row->>'qty')::integer;
    v_cost := COALESCE((v_row->>'unit_cost')::numeric, 0);
    IF v_bv IS NULL OR v_sub IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT warehouse_id INTO v_wh FROM public.warehouse_sub_containers WHERE id = v_sub;
    IF v_wh IS NULL THEN
      RAISE EXCEPTION 'Unknown sub-container %', v_sub USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id, sub_container_id, date,
      qty, remaining_qty, unit_cost, total_unit_cost, landed_cost_per_unit,
      source_type, source_currency, source_exchange_rate
    ) VALUES (
      v_bv, v_wh, v_sub, CURRENT_DATE,
      v_qty, v_qty, v_cost, v_cost, 0,
      'inventory_import', 'QAR', 1
    );

    v_layers   := v_layers + 1;
    v_units    := v_units + v_qty;
    v_value    := v_value + (v_qty * v_cost);
    v_variants := array_append(v_variants, v_bv);
  END LOOP;

  -- Caches the FIFO trigger does not maintain (refresh_stock_summary_row builds
  -- warehouse_stock_summary only). Not guarded — the pricing guard fires only on
  -- cost_price/selling_price changes, which we don't touch here.
  SELECT array_agg(DISTINCT x) INTO v_variants FROM unnest(v_variants) AS x;
  IF v_variants IS NOT NULL AND array_length(v_variants, 1) > 0 THEN
    UPDATE public.inventory_item_brand_variants bv SET
      stock_level = COALESCE((
        SELECT SUM(l.remaining_qty) FROM public.fifo_cost_layers l
        WHERE l.brand_variant_id = bv.id AND l.remaining_qty > 0), 0),
      average_cost = COALESCE((
        SELECT SUM(l.remaining_qty::numeric * l.total_unit_cost) FILTER (WHERE l.total_unit_cost > 0)
             / NULLIF(SUM(l.remaining_qty) FILTER (WHERE l.total_unit_cost > 0), 0)
        FROM public.fifo_cost_layers l
        WHERE l.brand_variant_id = bv.id AND l.remaining_qty > 0), bv.average_cost)
    WHERE bv.id = ANY(v_variants);

    UPDATE public.inventory_items ii SET
      total_stock = COALESCE((
        SELECT SUM(bv.stock_level) FROM public.inventory_item_brand_variants bv
        WHERE bv.item_id = ii.id), 0)
    WHERE ii.id IN (
      SELECT DISTINCT item_id FROM public.inventory_item_brand_variants WHERE id = ANY(v_variants));
  END IF;

  RETURN jsonb_build_object('layers_created', v_layers, 'units', v_units, 'value', v_value);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_import_inventory_stock(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_inventory_stock(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
