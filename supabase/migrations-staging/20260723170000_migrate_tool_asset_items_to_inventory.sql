-- Phase 2 of the tools→inventory merge.
-- For every tool_asset_items row, ensure a matching inventory_items +
-- inventory_brand_variants exists, then repoint the purchase chain.
-- Idempotent: safe to run against an empty tool_asset_items (staging).

BEGIN;

-- 1. Ensure a "Tools & Assets" top-level category exists for the tools type.
INSERT INTO public.inventory_categories (name_en, type, sort_order)
SELECT 'Tools & Assets (Migrated)', 'tools', 999
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_categories
  WHERE type = 'tools' AND parent_id IS NULL
);

-- 2. For each tool_asset_items row, create matching inventory_items +
--    a single inventory_brand_variants (SKU derived from tool id).
--    Track mapping in a temp table so we can update purchase chain FKs.

CREATE TEMP TABLE _tool_variant_map (
  tool_asset_item_id uuid PRIMARY KEY,
  brand_variant_id   uuid NOT NULL
);

WITH root_cat AS (
  SELECT id AS cat_id
  FROM public.inventory_categories
  WHERE type = 'tools' AND parent_id IS NULL
  ORDER BY sort_order, name_en
  LIMIT 1
),
new_items AS (
  INSERT INTO public.inventory_items (category_id, name_en, name_ar)
  SELECT
    COALESCE(tai.category_id, (SELECT cat_id FROM root_cat)),
    tai.name_en,
    tai.name_ar
  FROM public.tool_asset_items tai
  WHERE NOT EXISTS (
    -- avoid re-inserting if we already migrated this row (idempotency)
    SELECT 1 FROM public.inventory_items ii
    WHERE ii.name_en = tai.name_en
      AND ii.category_id = COALESCE(tai.category_id, (SELECT cat_id FROM root_cat))
  )
  RETURNING id, name_en, category_id
),
new_variants AS (
  INSERT INTO public.inventory_brand_variants (item_id, brand, code, cost_price, selling_price)
  SELECT ni.id, 'Migrated', 'TOOL-' || SUBSTRING(ni.id::text, 1, 8), 0, 0
  FROM new_items ni
  RETURNING id, item_id
)
INSERT INTO _tool_variant_map (tool_asset_item_id, brand_variant_id)
SELECT
  tai.id,
  nv.id
FROM public.tool_asset_items tai
JOIN public.inventory_items ii
  ON ii.name_en = tai.name_en
 AND ii.category_id = COALESCE(tai.category_id, (SELECT cat_id FROM root_cat))
JOIN public.inventory_brand_variants nv ON nv.item_id = ii.id;

-- 3. Repoint the purchase chain — six tables.
UPDATE public.po_line_items       SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.po_line_items.tool_asset_item_id       = m.tool_asset_item_id;

UPDATE public.po_version_lines    SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.po_version_lines.tool_asset_item_id    = m.tool_asset_item_id;

UPDATE public.receival_items      SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.receival_items.tool_asset_item_id      = m.tool_asset_item_id;

UPDATE public.return_lines        SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.return_lines.tool_asset_item_id        = m.tool_asset_item_id;

UPDATE public.sale_order_lines    SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.sale_order_lines.tool_asset_item_id    = m.tool_asset_item_id;

UPDATE public.sale_delivery_lines SET brand_variant_id = m.brand_variant_id, tool_asset_item_id = NULL
FROM _tool_variant_map m WHERE public.sale_delivery_lines.tool_asset_item_id = m.tool_asset_item_id;

-- 4. Sanity: after this migration, no tool_asset_item_id anywhere should
--    reference a tool_asset_items row (they've all been repointed).
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT 1 FROM public.po_line_items       WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.po_version_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.receival_items      WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.return_lines        WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_order_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_delivery_lines WHERE tool_asset_item_id IS NOT NULL
  ) x;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rows still have tool_asset_item_id set', v_remaining;
  END IF;
END $$;

DROP TABLE _tool_variant_map;

COMMIT;
