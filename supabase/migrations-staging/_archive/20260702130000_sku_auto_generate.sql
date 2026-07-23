-- Auto-generate SKU codes for brand variants on INSERT/UPDATE
-- Pattern: CAT-ITEM-NNN (e.g. ACR-INV-001 for AC & Refrigeration / Inverter)

-- 1. Helper: extract uppercase abbreviation from a name (strip non-alpha, take first N chars)
CREATE OR REPLACE FUNCTION public.sku_abbreviation(input text, len integer DEFAULT 3)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(left(regexp_replace(input, '[^A-Za-z]', '', 'g'), len))
$$;

-- 2. Trigger function: generate CAT-ITEM-NNN code when code is NULL or empty
CREATE OR REPLACE FUNCTION public.generate_brand_variant_sku()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_cat_name  text;
  v_item_name text;
  v_cat_abbr  text;
  v_item_abbr text;
  v_prefix    text;
  v_next_seq  integer;
BEGIN
  -- Only generate if code is null or empty
  IF NEW.code IS NOT NULL AND trim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  -- Look up item and category names
  SELECT i.name_en, c.name_en
    INTO v_item_name, v_cat_name
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
   WHERE i.id = NEW.item_id;

  -- Build abbreviations (fallback to 'XXX' if null/empty)
  v_cat_abbr  := coalesce(nullif(public.sku_abbreviation(v_cat_name, 3), ''), 'XXX');
  v_item_abbr := coalesce(nullif(public.sku_abbreviation(v_item_name, 3), ''), 'XXX');
  v_prefix    := v_cat_abbr || '-' || v_item_abbr || '-';

  -- Find next sequential number for this prefix
  SELECT coalesce(max(
    (regexp_match(code, v_prefix || '(\d+)$'))[1]::integer
  ), 0) + 1
    INTO v_next_seq
    FROM public.inventory_brand_variants
   WHERE code LIKE v_prefix || '%';

  NEW.code := v_prefix || lpad(v_next_seq::text, 3, '0');

  RETURN NEW;
END;
$$;

-- 3. Trigger on INSERT and UPDATE
CREATE TRIGGER trg_auto_brand_variant_sku
  BEFORE INSERT OR UPDATE ON public.inventory_brand_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_brand_variant_sku();

-- 4. Backfill existing rows that have NULL or empty code
-- Direct backfill using the same logic (avoids trigger-within-trigger issues)
DO $$
DECLARE
  r RECORD;
  v_cat_name  text;
  v_item_name text;
  v_cat_abbr  text;
  v_item_abbr text;
  v_prefix    text;
  v_next_seq  integer;
  v_new_code  text;
BEGIN
  FOR r IN (
    SELECT bv.id, bv.item_id
    FROM public.inventory_brand_variants bv
    WHERE bv.code IS NULL OR trim(bv.code) = ''
    ORDER BY bv.created_at, bv.id
  ) LOOP
    -- Look up item and category names
    SELECT i.name_en, c.name_en
      INTO v_item_name, v_cat_name
      FROM public.inventory_items i
      LEFT JOIN public.inventory_categories c ON c.id = i.category_id
     WHERE i.id = r.item_id;

    v_cat_abbr  := coalesce(nullif(upper(left(regexp_replace(v_cat_name, '[^A-Za-z]', '', 'g'), 3)), ''), 'XXX');
    v_item_abbr := coalesce(nullif(upper(left(regexp_replace(v_item_name, '[^A-Za-z]', '', 'g'), 3)), ''), 'XXX');
    v_prefix    := v_cat_abbr || '-' || v_item_abbr || '-';

    -- Find next sequential number for this prefix (includes already-backfilled rows)
    SELECT coalesce(max(
      (regexp_match(code, v_prefix || '(\d+)$'))[1]::integer
    ), 0) + 1
      INTO v_next_seq
      FROM public.inventory_brand_variants
     WHERE code LIKE v_prefix || '%';

    v_new_code := v_prefix || lpad(v_next_seq::text, 3, '0');

    -- Direct update (trigger will see code is non-empty and skip)
    UPDATE public.inventory_brand_variants
       SET code = v_new_code
     WHERE id = r.id;
  END LOOP;
END;
$$;
