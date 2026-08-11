-- Consumer-division guard on rpc_post_consumption.
--
-- The New-Consumption picker already scopes the consumer team/place list to the
-- caller's division(s) in the UI (useUserDivisionScope). Hiding options in the
-- UI is not a boundary — a direct RPC call could still book COGS to a team in
-- any division. This adds the matching server-side check.
--
-- Rule (mirrors the UI scope): a user may book a consumption to a team/place
-- only when that team/place's division is one they belong to
-- (user_company_divisions), with two overrides:
--   * Owner / Accountant (user_data.user_type) — super-viewers who oversee every
--     division (same set is_division_visible treats as cross-division), and
--   * custody admin (_has_custody_admin_role = inventory_manager / system admin),
--     matching the existing source-access override.
-- Internal use has no consumer division and stays unrestricted here (the source
-- guard already governs where the stock is drawn from).
--
-- Body is the live definition verbatim; only `v_consumer_div` (DECLARE) and the
-- guard block after the source-access check are new. Per-layer COGS + numbering
-- are unchanged.

CREATE OR REPLACE FUNCTION public.rpc_post_consumption(p_source_warehouse_id uuid, p_source_sub_container_id uuid, p_consumer_type text, p_consumer_team_sub_id uuid, p_consumer_place_sub_id uuid, p_consumer_customer_id uuid, p_notes text, p_attachments text[], p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_consumption_id       uuid;
  v_ce_number            text;
  v_sub                  RECORD;
  v_line                 jsonb;
  v_variant_id           uuid;
  v_qty                  int;
  v_label                RECORD;
  v_layer                RECORD;
  v_qty_taken_sum        int;
  v_total_cost_sum       numeric;
  v_weighted_unit_cost   numeric;
  v_uid                  uuid := public._current_user_data_id();
  v_consumer_div         uuid;
  v_touched_variants     uuid[] := '{}';
  v_variant              uuid;
BEGIN
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_post_consumption: at least one line is required';
  END IF;

  IF p_consumer_type NOT IN ('team','place','internal') THEN
    RAISE EXCEPTION 'rpc_post_consumption: invalid consumer_type % (expected team|place|internal)', p_consumer_type;
  END IF;

  IF p_consumer_type = 'team'  AND p_consumer_team_sub_id  IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=team requires consumer_team_sub_id';
  END IF;
  IF p_consumer_type = 'place' AND p_consumer_place_sub_id IS NULL THEN
    RAISE EXCEPTION 'rpc_post_consumption: consumer_type=place requires consumer_place_sub_id';
  END IF;

  IF p_consumer_type <> 'team'  THEN p_consumer_team_sub_id  := NULL; END IF;
  IF p_consumer_type <> 'place' THEN p_consumer_place_sub_id := NULL; END IF;
  -- Customer branch was dropped in the Task 9 revision — always NULL.
  p_consumer_customer_id := NULL;

  SELECT sc.id, sc.warehouse_id, sc.division_id, sc.is_active
    INTO v_sub
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = p_source_sub_container_id;

  IF NOT FOUND OR v_sub.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % not found or inactive', p_source_sub_container_id;
  END IF;
  IF v_sub.warehouse_id <> p_source_warehouse_id THEN
    RAISE EXCEPTION 'rpc_post_consumption: source sub-container % does not belong to warehouse %', p_source_sub_container_id, p_source_warehouse_id;
  END IF;

  -- ── Access control: caller must be assigned to this source (or an admin) ──
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to post a consumption.';
  END IF;
  IF NOT (
        public.is_field_rp_of(v_uid, p_source_warehouse_id)
     OR EXISTS (
          SELECT 1 FROM public.warehouse_sub_containers sc2
          WHERE  sc2.id = p_source_sub_container_id
            AND  sc2.responsible_person_profile_id = v_uid
        )
     OR public._has_custody_admin_role(v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this warehouse or custody, so you cannot post a consumption from it.';
  END IF;

  -- ── Consumer-division guard: only book COGS to a team/place in a division
  -- the caller belongs to. Owner/Accountant + custody-admin override. Internal
  -- use has no consumer division and is left to the source guard above. ──
  IF p_consumer_type IN ('team','place') THEN
    SELECT sc.division_id INTO v_consumer_div
    FROM public.warehouse_sub_containers sc
    WHERE sc.id = COALESCE(p_consumer_team_sub_id, p_consumer_place_sub_id);

    IF v_consumer_div IS NOT NULL
       AND NOT public._has_custody_admin_role(v_uid)
       AND NOT EXISTS (
             SELECT 1 FROM public.user_data ud
             WHERE ud.id = v_uid AND ud.user_type IN ('owner','accountant')
           )
       AND NOT EXISTS (
             SELECT 1 FROM public.user_company_divisions ucd
             WHERE ucd.profile_id = v_uid AND ucd.division_id = v_consumer_div
           )
    THEN
      RAISE EXCEPTION 'You can only book a consumption to a team or place in your own division.';
    END IF;
  END IF;

  v_ce_number := public.generate_consumption_number(p_consumer_type);

  INSERT INTO public.consumption_entries (
    ce_number, date,
    source_warehouse_id, source_sub_container_id,
    consumer_type, consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
    notes, attachments,
    status, created_by, posted_by, posted_at,
    division_id
  ) VALUES (
    v_ce_number, current_date,
    p_source_warehouse_id, p_source_sub_container_id,
    p_consumer_type, p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
    NULLIF(p_notes, ''), COALESCE(p_attachments, '{}'::text[]),
    'posted', v_uid, v_uid, now(),
    v_sub.division_id
  )
  RETURNING id INTO v_consumption_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_variant_id := (v_line->>'brand_variant_id')::uuid;
    v_qty        := (v_line->>'qty')::int;

    IF v_variant_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'rpc_post_consumption: invalid line %', v_line;
    END IF;

    SELECT COALESCE(ii.name_en, '')::text AS item_name,
           COALESCE(ii.sku, '')::text     AS sku
      INTO v_label
      FROM public.inventory_item_brand_variants bv
      LEFT JOIN public.inventory_items ii ON ii.id = bv.item_id
      WHERE bv.id = v_variant_id;

    v_qty_taken_sum := 0;
    v_total_cost_sum := 0;

    FOR v_layer IN
      SELECT layer_id, source_type, source_id, qty_taken, unit_cost, total_cost
      FROM   public.deduct_fifo_layers(
        v_variant_id,
        p_source_warehouse_id,
        v_qty,
        false,
        p_source_sub_container_id
      )
    LOOP
      v_qty_taken_sum  := v_qty_taken_sum  + v_layer.qty_taken;
      v_total_cost_sum := v_total_cost_sum + v_layer.total_cost;

      INSERT INTO public.cogs_entries (
        brand_variant_id, qty, unit_cost, total_cost, date,
        source_type, source_id,
        consumption_id, consumer_type,
        consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
        division_id, consumer_division_id
      ) VALUES (
        v_variant_id, v_layer.qty_taken, v_layer.unit_cost, v_layer.total_cost, current_date,
        'consumption', v_layer.layer_id,
        v_consumption_id, p_consumer_type,
        p_consumer_team_sub_id, p_consumer_place_sub_id, p_consumer_customer_id,
        v_sub.division_id, v_sub.division_id
      );

      INSERT INTO public.inventory_stock_movements (
        warehouse_id, sub_container_id, brand_variant_id,
        item_name, sku, movement_type, qty, unit_cost,
        reference_type, reference_id, notes
      ) VALUES (
        p_source_warehouse_id, p_source_sub_container_id, v_variant_id,
        v_label.item_name, NULLIF(v_label.sku, ''),
        'consumption', -v_layer.qty_taken, v_layer.unit_cost,
        'consumption', v_consumption_id, NULLIF(p_notes, '')
      );
    END LOOP;

    IF v_qty_taken_sum < v_qty THEN
      RAISE EXCEPTION 'rpc_post_consumption: insufficient stock for variant % at sub % (requested %, drained %)',
        v_variant_id, p_source_sub_container_id, v_qty, v_qty_taken_sum;
    END IF;

    v_weighted_unit_cost := v_total_cost_sum / v_qty_taken_sum;

    INSERT INTO public.consumption_lines (
      consumption_id, brand_variant_id, item_name, sku, qty, unit_cost
    ) VALUES (
      v_consumption_id, v_variant_id, v_label.item_name, NULLIF(v_label.sku, ''), v_qty, v_weighted_unit_cost
    );

    v_touched_variants := v_touched_variants || v_variant_id;
  END LOOP;

  SELECT ARRAY(SELECT DISTINCT unnest(v_touched_variants)) INTO v_touched_variants;
  FOREACH v_variant IN ARRAY v_touched_variants LOOP
    PERFORM public.recalc_average_cost(v_variant);
  END LOOP;

  RETURN v_consumption_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
