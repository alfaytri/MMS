-- Fix: create_inventory_receival RPC uses auth.uid() directly as profile_id,
-- but user_custom_roles.profile_id references profiles.id (a separate UUID).
-- Must look up profiles.id via profiles.auth_user_id = auth.uid().

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
  v_profile_id      uuid;
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

  SELECT p.id, p.full_name
  INTO   v_profile_id, v_caller_name
  FROM   public.profiles p
  WHERE  p.auth_user_id = v_auth_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = v_profile_id
      AND  cr.is_inventory_receiver = true
      AND  cr.deleted_at IS NULL
  ) INTO v_has_permission;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: you must have the "Can Create Inventory Receivals" role toggle'
      USING ERRCODE = '42501';
  END IF;

  -- === Step 2: Validate inputs ===
  IF p_mode NOT IN ('carve', 'new_stock') THEN
    RAISE EXCEPTION 'Invalid mode: %. Must be carve or new_stock', p_mode;
  END IF;
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;
  IF p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost cannot be negative';
  END IF;

  -- === Step 3: Generate receival number ===
  SELECT 'INV-' || LPAD((COALESCE(MAX(
    NULLIF(regexp_replace(receival_number, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1)::text, 5, '0')
  INTO v_receival_number
  FROM public.receivals
  WHERE receival_number LIKE 'INV-%';

  -- === Step 4: For carve mode, validate source layer ===
  IF p_mode = 'carve' THEN
    IF p_source_layer_id IS NULL THEN
      RAISE EXCEPTION 'source_layer_id is required for carve mode';
    END IF;
    SELECT * INTO v_source_layer
    FROM public.fifo_cost_layers
    WHERE id = p_source_layer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source FIFO layer not found';
    END IF;
    IF v_source_layer.remaining_qty < p_qty THEN
      RAISE EXCEPTION 'Source layer only has % remaining', v_source_layer.remaining_qty;
    END IF;
    IF v_source_layer.brand_variant_id != p_brand_variant_id THEN
      RAISE EXCEPTION 'Source layer does not belong to this brand variant';
    END IF;
    v_landed_cost := v_source_layer.landed_cost_per_unit;
  END IF;

  -- === Step 5: Create receival header ===
  INSERT INTO public.receivals (
    receival_number, warehouse_id, status, source_type,
    received_at, received_by, notes
  ) VALUES (
    v_receival_number, p_warehouse_id, 'completed', 'inventory',
    p_date, v_profile_id, p_notes
  ) RETURNING * INTO v_new_receival;

  -- === Step 6: Create receival item ===
  INSERT INTO public.receival_items (
    receival_id, brand_variant_id, expected_qty, received_qty, unit_cost
  ) VALUES (
    v_new_receival.id, p_brand_variant_id, p_qty, p_qty, p_unit_cost
  );

  -- === Step 7: Handle FIFO layers ===
  v_new_layer_id := gen_random_uuid();

  IF p_mode = 'carve' THEN
    UPDATE public.fifo_cost_layers
    SET    remaining_qty = remaining_qty - p_qty
    WHERE  id = p_source_layer_id;

    INSERT INTO public.fifo_cost_layers (
      id, brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type, receival_number
    ) VALUES (
      v_new_layer_id, p_brand_variant_id, p_warehouse_id, p_date,
      p_qty, p_unit_cost, v_landed_cost, p_unit_cost + v_landed_cost,
      p_qty, 'inventory_receival_carve', v_receival_number
    );
    v_movement_type := 'inventory_receival_carve';
    v_movement_qty  := p_qty;

  ELSE
    INSERT INTO public.fifo_cost_layers (
      id, brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type, receival_number
    ) VALUES (
      v_new_layer_id, p_brand_variant_id, p_warehouse_id, p_date,
      p_qty, p_unit_cost, 0, p_unit_cost,
      p_qty, 'inventory_receival_new', v_receival_number
    );

    UPDATE public.inventory_brand_variants
    SET    stock_level = stock_level + p_qty
    WHERE  id = p_brand_variant_id;

    v_movement_type := 'inventory_receival_new';
    v_movement_qty  := p_qty;
  END IF;

  -- === Step 8: Stock movement log ===
  INSERT INTO public.inventory_stock_movements (
    brand_variant_id, item_id, warehouse_id, qty_change,
    unit_cost, movement_type, reference_id, notes
  )
  SELECT
    p_brand_variant_id, ibv.item_id, p_warehouse_id,
    v_movement_qty, p_unit_cost,
    v_movement_type, v_new_receival.id,
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
