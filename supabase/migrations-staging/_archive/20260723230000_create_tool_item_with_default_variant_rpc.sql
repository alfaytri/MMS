-- RPC to atomically create a tool inventory_item plus a default
-- inventory_brand_variants row so the item is immediately pickable in
-- the cascade selector (PO/SO line-item picker relies on brand_variant_id).
--
-- Used by ToolAssetItemEditDialog on the Master Data → Tools & Assets tab.

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
BEGIN
  IF p_name_en IS NULL OR btrim(p_name_en) = '' THEN
    RAISE EXCEPTION 'name_en is required';
  END IF;

  INSERT INTO public.inventory_items (name_en, name_ar, category_id)
  VALUES (btrim(p_name_en), NULLIF(btrim(p_name_ar), ''), p_category_id)
  RETURNING id INTO v_item_id;

  INSERT INTO public.inventory_brand_variants (item_id, brand, cost_price, selling_price)
  VALUES (v_item_id, 'Default', 0, 0);

  RETURN v_item_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_tool_item_with_default_variant(text, text, uuid) TO authenticated;

COMMIT;
