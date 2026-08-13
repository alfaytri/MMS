-- Consumption numbering — per-consumer-type, monthly-resetting sequence.
--
-- Was: a single global CE-##### sequence (consumption_entry_seq). The operator
-- asked for numbers that (a) differentiate the consumer type and (b) carry the
-- year + month with a counter that resets to 01 at the start of each month, so a
-- number reads like  CE-Team-2026-08-01 / CE-Place-2026-08-01 / CE-Internal-2026-08-01.
--
-- Design: a small (consumer_type, period) counter table with an upsert that takes
-- a row lock — race-safe under concurrent posts (the previous COUNT(*) scheme was
-- explicitly abandoned for that reason in 20260815004400). A new (type, month)
-- row starts at 1, so the sequence resets automatically each month, per type.
-- generate_consumption_number now takes the consumer_type; rpc_post_consumption
-- (live body sourced via pg_get_functiondef — only the one call site changes)
-- passes it. The old no-arg generator is dropped; the now-orphaned
-- consumption_entry_seq sequence is harmless and left in place.
--
-- Existing CE-##### rows (staging test data) keep their old numbers — no backfill.

BEGIN;

-- 1. Counter table — internal, DEFINER-only (RLS on, grants revoked, no policy).
CREATE TABLE IF NOT EXISTS public.consumption_number_counters (
  consumer_type text        NOT NULL CHECK (consumer_type IN ('team','place','internal')),
  period        text        NOT NULL,               -- 'YYYY-MM'
  last_seq      int         NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_type, period)
);

ALTER TABLE public.consumption_number_counters ENABLE ROW LEVEL SECURITY;
-- Written ONLY by the SECURITY DEFINER generate_consumption_number(); never
-- touched directly by clients. RLS on + no policy + revoked grants = fully
-- locked to anon/authenticated while the DEFINER owner still writes it.
REVOKE ALL ON TABLE public.consumption_number_counters FROM anon, authenticated;

COMMENT ON TABLE public.consumption_number_counters IS
'Per-(consumer_type, YYYY-MM) counter backing generate_consumption_number(). '
'Row-locked upsert = race-safe; a fresh month row restarts the sequence at 1. '
'DEFINER-only: RLS enabled with no policy + grants revoked.';

-- 2. New generator — one arg (consumer_type), monthly-resetting per type.
CREATE OR REPLACE FUNCTION public.generate_consumption_number(p_consumer_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_type   text := lower(COALESCE(p_consumer_type, 'internal'));
  v_period text := to_char(current_date, 'YYYY-MM');
  v_seq    int;
BEGIN
  IF v_type NOT IN ('team','place','internal') THEN
    v_type := 'internal';
  END IF;

  INSERT INTO public.consumption_number_counters (consumer_type, period, last_seq)
  VALUES (v_type, v_period, 1)
  ON CONFLICT (consumer_type, period)
  DO UPDATE SET last_seq   = public.consumption_number_counters.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO v_seq;

  -- e.g. CE-Team-2026-08-01  (initcap → Team|Place|Internal; NN ≥ 2 digits, grows past 99).
  RETURN 'CE-' || initcap(v_type) || '-' || v_period || '-' || lpad(v_seq::text, 2, '0');
END;
$function$;

COMMENT ON FUNCTION public.generate_consumption_number(text) IS
'Next consumption number for a consumer_type: CE-<Type>-<YYYY>-<MM>-<NN>, where NN '
'is a per-(type, month) sequence that resets to 01 each month. Race-safe via the '
'consumption_number_counters row-locked upsert.';

-- 3. Point rpc_post_consumption at the new generator. Body is the live definition
--    (pg_get_functiondef); the ONLY change is the generate_consumption_number call
--    now passing p_consumer_type.
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

-- 4. Drop the old no-arg generator (only rpc_post_consumption referenced it, now repointed).
DROP FUNCTION IF EXISTS public.generate_consumption_number();

COMMIT;

NOTIFY pgrst, 'reload schema';
