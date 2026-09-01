-- Consumption warranties: create one warranty_record per custody-consumed line
-- whose item resolves a warranty policy, starting on the CONSUMPTION date.
-- Mirrors create_warranty_records_for_delivery (origin snapshot + numbering) but
-- sources from consumption lines. Custody-only; idempotent via the unique index
-- on consumption_line_id. Internal consumption gets no warranty.
CREATE OR REPLACE FUNCTION public.create_warranty_records_for_consumption(p_consumption_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ce            RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_country_id    integer;
  v_country_name  text;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_inserted      integer := 0;
BEGIN
  SELECT id, date, division_id, consumer_type
  INTO   v_ce
  FROM   public.consumption_entries
  WHERE  id = p_consumption_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Warranty only on custody consumption (the sale case); internal gets none.
  IF v_ce.consumer_type <> 'custody' OR v_ce.division_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty
    FROM   public.consumption_lines
    WHERE  consumption_id = p_consumption_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty IS NULL
       OR v_line.qty <= 0
    THEN
      CONTINUE;
    END IF;

    SELECT biv.item_id, biv.country_id, cc.name
    INTO   v_item_id, v_country_id, v_country_name
    FROM   public.inventory_item_brand_variants biv
    LEFT JOIN public.country_codes cc ON cc.id = biv.country_id
    WHERE  biv.id = v_line.brand_variant_id;

    IF v_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_policy_id := public.get_effective_warranty_policy(v_item_id);

    IF v_policy_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_policy
    FROM   public.warranty_policies
    WHERE  id = v_policy_id;

    IF v_policy.duration_months = 0 THEN
      CONTINUE;
    END IF;

    -- Consumption has no delivery/invoice split: the warranty always starts on
    -- the consumption date. The policy's starts_from is still snapshotted for
    -- the record of what rule was in force.
    v_start_date := COALESCE(v_ce.date, CURRENT_DATE);

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      consumption_id,
      consumption_line_id,
      division_id,
      brand_variant_id,
      item_name,
      sku,
      qty,
      policy_id,
      policy_name_snapshot,
      coverage_type_snapshot,
      duration_months_snapshot,
      terms_en_snapshot,
      terms_ar_snapshot,
      void_conditions_snapshot,
      starts_from_snapshot,
      start_date,
      end_date,
      origin_country_id,
      origin_name_snapshot
    ) VALUES (
      public.next_warranty_number('consumption'::warranty_source_type, v_ce.division_id),
      'consumption'::warranty_source_type,
      v_ce.id,
      v_line.id,
      v_ce.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      NULLIF(v_line.sku, ''),
      v_line.qty,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date,
      v_country_id,
      v_country_name
    )
    ON CONFLICT (consumption_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_warranty_records_for_consumption(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_warranty_records_for_consumption(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
