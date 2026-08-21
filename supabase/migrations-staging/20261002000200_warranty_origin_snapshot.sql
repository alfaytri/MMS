-- Stage 2 Task 1: country-of-origin snapshot on warranty_records + certificate.
--
-- Plan text (docs/plans/2026-08-21-warranty-completion/02-registry-and-origin.md,
-- README.md "Live-verified facts") assumed the origin lookup table is
-- `public.countries` with a uuid PK and a `.name` column. Live-checked here
-- (2026-08-21, staging): `to_regclass('public.countries')` is NULL — there is
-- NO countries table in any schema. The actual FK on
-- inventory_item_brand_variants.country_id is:
--   FOREIGN KEY (country_id) REFERENCES country_codes(id) ON DELETE SET NULL
-- and country_codes.id is `integer` (int4), not uuid. `country_codes` is the
-- existing shared reference table already used both for phone dialing codes
-- (PhoneInputWithCode / useCountryCodes) and for the inventory "Origin"
-- picker (OriginCombobox in BrandVariantEditDialog.tsx) — it has
-- (id integer, code, iso, flag, name, is_active, sort_order). This migration
-- therefore targets country_codes(id) with an integer FK column, not
-- countries(id)/uuid as the plan text literally states.

BEGIN;

ALTER TABLE public.warranty_records
  ADD COLUMN IF NOT EXISTS origin_country_id   integer REFERENCES public.country_codes(id),
  ADD COLUMN IF NOT EXISTS origin_name_snapshot text;

COMMENT ON COLUMN public.warranty_records.origin_country_id IS
  'Country of origin at issuance time (FK to country_codes.id); informational, nullable.';
COMMENT ON COLUMN public.warranty_records.origin_name_snapshot IS
  'Country-of-origin name snapshotted at issuance for legal immutability.';

-- Re-issue create_warranty_records_for_delivery. Body reproduced verbatim from
-- live pg_get_functiondef (fetched 2026-08-21 against staging), which already
-- includes the Stage-1 fix (20261002000100): next_warranty_number()-derived
-- warranty_number + source_type in the INSERT. The ONLY changes here are:
--   1. two new locals (v_country_id, v_country_name)
--   2. the brand-variant lookup extended with a LEFT JOIN to country_codes to
--      populate those locals alongside the existing v_item_id
--   3. two new columns (origin_country_id, origin_name_snapshot) + their
--      VALUES, appended at the end of the INSERT
-- Everything else — including the warranty_number/source_type wiring from the
-- Stage-1 fix — is byte-identical to the live body.
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
  v_country_id    integer;
  v_country_name  text;
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
      end_date,
      origin_country_id,
      origin_name_snapshot
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
      (v_start_date + (v_policy.duration_months || ' months')::interval)::date,
      v_country_id,
      v_country_name
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
