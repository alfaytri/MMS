-- Fix: receivals.received_by has FK to employees(id), but the RPC was
-- inserting profiles.id which doesn't match any employee. Set it to NULL
-- (consistent with create_and_approve_receival) and rely on received_by_name.

CREATE OR REPLACE FUNCTION public.create_inventory_receival(
  p_mode              text,
  p_warehouse_id      uuid,
  p_brand_variant_id  uuid,
  p_qty               integer,
  p_unit_cost         numeric,
  p_source_layer_id   uuid,
  p_date              date,
  p_notes             text
) RETURNS public.receivals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id         uuid := auth.uid();
  v_caller_id       uuid;
  v_caller_name     text;
  v_has_permission  boolean;
  v_receival_number text;
  v_new_receival    public.receivals;
  v_source_layer    public.fifo_cost_layers;
  v_landed_cost     numeric := 0;
  v_new_layer_id    uuid;
  v_movement_type   text;
  v_movement_qty    integer;
BEGIN
  -- === Step 1: Permission check ===
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Look up profiles.id from auth_user_id (they are different UUIDs)
  SELECT p.id INTO v_caller_id
  FROM   public.profiles p
  WHERE  p.auth_user_id = v_auth_id;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for auth user' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_caller_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  -- === Step 2: Validate inputs ===
  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive' USING ERRCODE = '22023';
  END IF;
  IF p_warehouse_id IS NULL OR p_brand_variant_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and brand variant are required' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'Source layer is required for carve mode' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source layer % not found', p_source_layer_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION 'Source layer does not belong to warehouse %', p_warehouse_id USING ERRCODE = '22023';
    END IF;
    IF v_source_layer.brand_variant_id <> p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to brand variant %', p_brand_variant_id USING ERRCODE = '22023';
    END IF;
    IF p_qty > v_source_layer.remaining_qty THEN
      RAISE EXCEPTION 'Requested qty % exceeds source layer remaining %', p_qty, v_source_layer.remaining_qty USING ERRCODE = '22023';
    END IF;

    v_landed_cost := v_source_layer.landed_cost_per_unit;
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- === Step 3: Look up caller name ===
  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.profiles p
  JOIN   auth.users au ON au.id = p.auth_user_id
  WHERE  p.id = v_caller_id;

  -- === Step 4: Generate INV-NNNNN receival number ===
  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  -- === Step 5: Insert the receivals row ===
  -- received_by is NULL because it FK-references employees(id) and we only
  -- have a profiles.id here. received_by_name carries the display identity.
  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    NULL, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  -- === Step 6: Insert receival_items row (single line) ===
  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false
  FROM public.inventory_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 7: Handle FIFO layers ===
  IF p_mode = 'carve' THEN
    -- Decrement source layer
    UPDATE public.fifo_cost_layers
       SET qty = qty - p_qty,
           remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    -- Insert new carved layer, inheriting landed_cost_per_unit
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, p_unit_cost + v_landed_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    v_movement_type := 'inventory_receival_carve';
    v_movement_qty  := 0;
  ELSE
    -- new_stock: add fresh layer + bump stock_level
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id::text, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival'
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;

    v_movement_type := 'inventory_receival_new';
    v_movement_qty  := p_qty;
  END IF;

  -- === Step 8: Insert stock movement row ===
  INSERT INTO public.inventory_stock_movements (
    warehouse_id, brand_variant_id, item_name, sku,
    movement_type, qty, unit_cost,
    reference_type, reference_id, notes
  )
  SELECT
    p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
    v_movement_type, v_movement_qty, p_unit_cost,
    'receival', v_new_receival.id,
    'Inventory Receival ' || v_receival_number
  FROM public.inventory_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  -- === Step 9: Recompute average cost ===
  PERFORM public.recalc_average_cost(p_brand_variant_id);

  -- === Step 10: Return ===
  RETURN v_new_receival;
END;
$$;

NOTIFY pgrst, 'reload schema';
