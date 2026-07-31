-- =============================================================================
-- Warehouse Model v2 — Phase D.2 (b): rewrite create_inventory_receival to
-- populate sub_container_id on every stock-side INSERT.
--
-- This RPC was missed by the Phase C.2 RPC sweep. Since C.2.f flipped
-- fifo_cost_layers.sub_container_id and inventory_stock_movements.sub_container_id
-- to NOT NULL, every call to this function fails on the FIFO / movement inserts.
-- Nobody hit it because manual inventory receival (triggered from a brand-
-- variant row in Master Data → Inventory) is rarely used.
--
-- Deltas from the live body (sourced verbatim via pg_proc.prosrc):
--   1. Signature: append `p_sub_container_id uuid` — REQUIRED (no default);
--      unlike PO receival there's no division to derive from.
--   2. Validation up front: sub-container must exist, be active, and belong
--      to p_warehouse_id.
--   3. Both fifo_cost_layers INSERTs (carve + new_stock branches) add
--      sub_container_id column + v_sub_container_id value.
--   4. All three inventory_stock_movements INSERTs add sub_container_id.
--   5. receival_items INSERT adds sub_container_id.
-- Everything else preserved verbatim.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_inventory_receival(
  text, uuid, uuid, integer, numeric, uuid, date, text
);

CREATE OR REPLACE FUNCTION public.create_inventory_receival(
  p_mode              text,
  p_warehouse_id      uuid,
  p_brand_variant_id  uuid,
  p_qty               integer,
  p_unit_cost         numeric,
  p_source_layer_id   uuid,
  p_date              date,
  p_notes             text,
  p_sub_container_id  uuid
) RETURNS public.receivals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id           uuid := auth.uid();
  v_caller_id         uuid;
  v_caller_name       text;
  v_has_permission    boolean;
  v_receival_number   text;
  v_new_receival      public.receivals;
  v_source_layer      public.fifo_cost_layers;
  v_landed_cost       numeric := 0;
  v_source_total_cost numeric;
  v_new_total_cost    numeric;
  v_new_layer_id      uuid;
  v_sub_container_id  uuid := p_sub_container_id;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_caller_id
  FROM   public.user_data p
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

  -- Phase D.2: sub-container is required (no PO to derive from).
  IF v_sub_container_id IS NULL THEN
    RAISE EXCEPTION 'Sub-container is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_sub_containers sc
     WHERE sc.id = v_sub_container_id
       AND sc.warehouse_id = p_warehouse_id
       AND sc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sub-container % is inactive or not in warehouse %',
      v_sub_container_id, p_warehouse_id USING ERRCODE = '22023';
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

    v_landed_cost       := COALESCE(v_source_layer.landed_cost_per_unit, 0);
    v_source_total_cost := COALESCE(v_source_layer.total_unit_cost,
                                    v_source_layer.unit_cost + v_landed_cost);
  ELSE
    IF p_source_layer_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_layer_id must be null for new_stock mode' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), au.email, 'Unknown')
    INTO v_caller_name
  FROM   public.user_data p
  JOIN   auth.users au ON au.id = p.auth_user_id
  WHERE  p.id = v_caller_id;

  v_receival_number := 'INV-' || LPAD(nextval('public.inventory_receival_number_seq')::text, 5, '0');

  INSERT INTO public.receivals (
    receival_number, po_id, warehouse_id, date,
    received_by, received_by_name, notes, status,
    source_type, carved_from_layer_id
  ) VALUES (
    v_receival_number, NULL, p_warehouse_id, p_date,
    NULL, v_caller_name, p_notes, 'approved',
    'inventory', p_source_layer_id
  ) RETURNING * INTO v_new_receival;

  INSERT INTO public.receival_items (
    receival_id, po_line_item_id, brand_variant_id,
    item_name, sku, qty_received, unit_cost, is_free,
    sub_container_id
  )
  SELECT
    v_new_receival.id, NULL, p_brand_variant_id,
    ii.name_en, ii.sku, p_qty, p_unit_cost, false,
    v_sub_container_id
  FROM public.inventory_item_brand_variants ibv
  JOIN public.inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.id = p_brand_variant_id;

  IF p_mode = 'carve' THEN
    UPDATE public.fifo_cost_layers
       SET remaining_qty = remaining_qty - p_qty
     WHERE id = p_source_layer_id;

    v_new_total_cost := p_unit_cost + v_landed_cost;
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      v_landed_cost, v_new_total_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;
  ELSE
    INSERT INTO public.fifo_cost_layers (
      brand_variant_id, warehouse_id,
      receival_id, receival_number,
      date, qty, unit_cost,
      landed_cost_per_unit, total_unit_cost,
      remaining_qty, source_type,
      sub_container_id
    ) VALUES (
      p_brand_variant_id, p_warehouse_id,
      v_new_receival.id, v_receival_number,
      p_date, p_qty, p_unit_cost,
      0, p_unit_cost,
      p_qty, 'receival',
      v_sub_container_id
    ) RETURNING id INTO v_new_layer_id;

    UPDATE public.inventory_item_brand_variants
       SET stock_level = stock_level + p_qty
     WHERE id = p_brand_variant_id;
  END IF;

  IF p_mode = 'carve' THEN
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      -p_qty, v_source_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved out of source layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;

    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_carve'::stock_movement_type,
      p_qty, v_new_total_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number || ' — carved into new layer',
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  ELSE
    INSERT INTO public.inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost,
      reference_type, reference_id, notes,
      sub_container_id
    )
    SELECT
      p_warehouse_id, p_brand_variant_id, ii.name_en, ii.sku,
      'inventory_receival_new'::stock_movement_type,
      p_qty, p_unit_cost,
      'receival', v_new_receival.id,
      'Inventory Receival ' || v_receival_number,
      v_sub_container_id
    FROM public.inventory_item_brand_variants ibv
    JOIN public.inventory_items ii ON ii.id = ibv.item_id
    WHERE ibv.id = p_brand_variant_id;
  END IF;

  PERFORM public.recalc_average_cost(p_brand_variant_id);

  RETURN v_new_receival;
END;
$$;
