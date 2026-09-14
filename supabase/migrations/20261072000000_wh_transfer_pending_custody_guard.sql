-- Extend create_transfer_v2 (WH -> WH transfers) to also subtract OTHER pending
-- custody requests from the same source sub-container when computing available-
-- to-promise — mirroring the guard added to rpc_create_custody_assign
-- (20261071). Custody requests do not create warehouse_stock_allocations, so
-- before this a WH->WH transfer's check (FIFO − allocations) ignored stock
-- already promised to pending custody assigns, letting a WH->WH transfer over-
-- commit the same shelf and fail later at dispatch.
--
-- available-to-promise (source sub, variant) =
--     physical FIFO remaining
--   − WH->WH soft allocations (warehouse_stock_allocations)
--   − SUM(requested_qty) of OTHER pending (undispatched) custody_assign lines
--     from the same source sub-container.
--
-- Signature, SECURITY DEFINER and search_path are preserved (the live function
-- is SECURITY DEFINER with search_path=public,pg_temp). Body is the live
-- definition (20260807000300) verbatim except the availability computation and
-- the shortfall message.

CREATE OR REPLACE FUNCTION public.create_transfer_v2(
  p_from_warehouse_id      uuid,
  p_to_warehouse_id        uuid,
  p_date                   date,
  p_items                  jsonb,
  p_notes                  text  DEFAULT NULL,
  p_created_by_profile_id  uuid  DEFAULT NULL,
  p_created_by_name        text  DEFAULT NULL,
  p_from_sub_container_id  uuid  DEFAULT NULL,
  p_to_sub_container_id    uuid  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_transfer_id           UUID;
  v_transfer_number       TEXT;
  v_item                  JSONB;
  v_bv_id                 UUID;
  v_qty                   INT;
  v_available             INT;
  v_from_sub_container_id UUID;
  v_to_sub_container_id   UUID;
  v_from_count            INT;
  v_to_count              INT;
BEGIN
  -- ─ Resolve source sub-container ─────────────────────────────────────
  IF p_from_sub_container_id IS NOT NULL THEN
    v_from_sub_container_id := p_from_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_from_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active;

    IF v_from_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_from_sub_container_id',
        p_from_warehouse_id;
    END IF;

    SELECT id INTO v_from_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_from_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_from_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_from_warehouse_id;
    END IF;
  END IF;

  -- ─ Resolve destination sub-container ────────────────────────────────
  IF p_to_sub_container_id IS NOT NULL THEN
    v_to_sub_container_id := p_to_sub_container_id;
  ELSE
    SELECT COUNT(*) INTO v_to_count
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active;

    IF v_to_count > 1 THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has multiple sub-containers; operator must specify p_to_sub_container_id',
        p_to_warehouse_id;
    END IF;

    SELECT id INTO v_to_sub_container_id
      FROM public.warehouse_sub_containers
     WHERE warehouse_id = p_to_warehouse_id
       AND is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_to_sub_container_id IS NULL THEN
      RAISE EXCEPTION
        'create_transfer_v2: warehouse % has no active sub-container',
        p_to_warehouse_id;
    END IF;
  END IF;

  v_transfer_number := generate_transfer_number();

  INSERT INTO warehouse_transfers (
    transfer_number, from_warehouse_id, to_warehouse_id,
    status, date, notes,
    created_by_profile_id, created_by_name,
    from_sub_container_id, to_sub_container_id
  ) VALUES (
    v_transfer_number, p_from_warehouse_id, p_to_warehouse_id,
    'pending', p_date, p_notes,
    p_created_by_profile_id, p_created_by_name,
    v_from_sub_container_id, v_to_sub_container_id
  )
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Lock the allocation row FIRST to prevent concurrent double-allocation
    -- within the same source sub-container.
    PERFORM 1 FROM warehouse_stock_allocations
    WHERE warehouse_id = p_from_warehouse_id
      AND brand_variant_id = v_bv_id
      AND sub_container_id = v_from_sub_container_id
    FOR UPDATE;

    -- Availability-to-promise in the source sub-container:
    --   FIFO remaining
    --   − WH→WH soft allocations (warehouse_stock_allocations)
    --   − other PENDING (undispatched) custody requests from the same source sub.
    -- The custody term matches rpc_create_custody_assign so a WH→WH transfer and
    -- a custody request can't both promise the same stock. All scoped to
    -- v_from_sub_container_id so a transfer can never spill into a peer sub.
    v_available := GREATEST(
        COALESCE((SELECT SUM(f.remaining_qty)::INT
                    FROM fifo_cost_layers f
                   WHERE f.brand_variant_id = v_bv_id
                     AND f.warehouse_id     = p_from_warehouse_id
                     AND f.sub_container_id = v_from_sub_container_id
                     AND f.remaining_qty    > 0), 0)
      - COALESCE((SELECT wsa.allocated_qty
                    FROM warehouse_stock_allocations wsa
                   WHERE wsa.warehouse_id     = p_from_warehouse_id
                     AND wsa.brand_variant_id = v_bv_id
                     AND wsa.sub_container_id = v_from_sub_container_id), 0)
      - COALESCE((SELECT SUM(wti.requested_qty)::INT
                    FROM warehouse_transfer_items wti
                    JOIN warehouse_transfers wt ON wt.id = wti.transfer_id
                   WHERE wt.transfer_kind         = 'custody_assign'
                     AND wt.status                = 'pending'
                     AND wt.from_sub_container_id = v_from_sub_container_id
                     AND wti.brand_variant_id     = v_bv_id), 0)
    , 0);

    IF COALESCE(v_available, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient available stock for item % (available: %, requested: %). Some may be reserved for pending transfers or custody requests.',
        COALESCE(v_item->>'item_name', v_bv_id::TEXT), COALESCE(v_available, 0), v_qty
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO warehouse_stock_allocations (warehouse_id, brand_variant_id, sub_container_id, allocated_qty)
    VALUES (p_from_warehouse_id, v_bv_id, v_from_sub_container_id, v_qty)
    ON CONFLICT (warehouse_id, brand_variant_id, sub_container_id)
    DO UPDATE SET allocated_qty = warehouse_stock_allocations.allocated_qty + v_qty,
                  updated_at = now();

    INSERT INTO warehouse_transfer_items (
      transfer_id, brand_variant_id, item_name, sku, requested_qty, unit_cost,
      sub_container_id
    ) VALUES (
      v_transfer_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      v_qty,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_from_sub_container_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer_v2(uuid, uuid, date, jsonb, text, uuid, text, uuid, uuid) TO authenticated;
