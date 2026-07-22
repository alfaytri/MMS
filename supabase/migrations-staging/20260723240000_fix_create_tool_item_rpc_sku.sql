-- Fix create_tool_item_with_default_variant: inventory_items.sku is NOT NULL,
-- but the initial RPC didn't set it. Auto-generate a short unique sku from
-- the row's UUID so the caller doesn't need to pass one.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tool_item_with_default_variant(
  p_name_en     text,
  p_name_ar     text,
  p_category_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_id uuid;
  v_sku     text;
BEGIN
  IF p_name_en IS NULL OR btrim(p_name_en) = '' THEN
    RAISE EXCEPTION 'name_en is required';
  END IF;

  v_item_id := gen_random_uuid();
  v_sku     := 'TOOL-' || SUBSTRING(v_item_id::text, 1, 8);

  INSERT INTO public.inventory_items (id, name_en, name_ar, category_id, sku)
  VALUES (v_item_id, btrim(p_name_en), NULLIF(btrim(p_name_ar), ''), p_category_id, v_sku);

  INSERT INTO public.inventory_brand_variants (item_id, brand, cost_price, selling_price)
  VALUES (v_item_id, 'Default', 0, 0);

  RETURN v_item_id;
END $$;

COMMIT;
