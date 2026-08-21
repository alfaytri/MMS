-- Stage 1 gate fix: create_warranty_records_for_delivery never set warranty_number.
--
-- Found by driving a real delivery of a warranty-covered item (the issuance path
-- had never run): the INSERT INTO warranty_records listed every column EXCEPT
-- warranty_number (and source_type) and never called next_warranty_number(),
-- so warranty_number came back NULL and the NOT NULL constraint aborted the
-- whole delivery transaction. i.e. delivering ANY warranty-covered item failed
-- outright. This wires the existing next_warranty_number() into the INSERT.
--
-- Body reproduced verbatim from live pg_get_functiondef; the ONLY change is the
-- two added columns (warranty_number, source_type) + their VALUES. division_id
-- is already guaranteed non-null above (the early RETURN 0), and 'sale' + the
-- counter are non-null, so the generated number is always non-null.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_warranty_records_for_delivery(p_delivery_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery      RECORD;
  v_line          RECORD;
  v_item_id       uuid;
  v_policy_id     uuid;
  v_policy        RECORD;
  v_start_date    date;
  v_invoice_date  date;
  v_inserted      integer := 0;
BEGIN
  SELECT sd.id, sd.date, sd.sale_order_id,
         so.customer_id, so.division_id
  INTO   v_delivery
  FROM   public.sale_deliveries sd
  JOIN   public.sale_orders so ON so.id = sd.sale_order_id
  WHERE  sd.id = p_delivery_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_delivery.division_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Invoice date: look up via the SO (so_invoices has no sale_delivery_id)
  SELECT MAX(issued_date)
  INTO   v_invoice_date
  FROM   public.so_invoices
  WHERE  sale_order_id = v_delivery.sale_order_id;

  FOR v_line IN
    SELECT id, brand_variant_id, item_name, sku, qty_delivered
    FROM   public.sale_delivery_lines
    WHERE  sale_delivery_id = p_delivery_id
  LOOP
    IF v_line.brand_variant_id IS NULL
       OR v_line.qty_delivered IS NULL
       OR v_line.qty_delivered <= 0
    THEN
      CONTINUE;
    END IF;

    SELECT item_id INTO v_item_id
    FROM   public.inventory_item_brand_variants
    WHERE  id = v_line.brand_variant_id;

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

    v_start_date := CASE
      WHEN v_policy.starts_from = 'invoice_date' AND v_invoice_date IS NOT NULL
        THEN v_invoice_date
      ELSE COALESCE(v_delivery.date, CURRENT_DATE)
    END;

    INSERT INTO public.warranty_records (
      warranty_number,
      source_type,
      sale_delivery_line_id,
      sale_order_id,
      customer_id,
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
      end_date
    ) VALUES (
      public.next_warranty_number('sale'::warranty_source_type, v_delivery.division_id),
      'sale'::warranty_source_type,
      v_line.id,
      v_delivery.sale_order_id,
      v_delivery.customer_id,
      v_delivery.division_id,
      v_line.brand_variant_id,
      COALESCE(v_line.item_name, 'Item'),
      v_line.sku,
      v_line.qty_delivered,
      v_policy.id,
      v_policy.name,
      v_policy.coverage_type,
      v_policy.duration_months,
      v_policy.terms_en,
      v_policy.terms_ar,
      v_policy.void_conditions,
      v_policy.starts_from,
      v_start_date,
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date
    )
    ON CONFLICT (sale_delivery_line_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
