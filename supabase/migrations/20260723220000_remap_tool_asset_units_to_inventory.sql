-- Remap tool_asset_units.item_id from tool_asset_items(id) to inventory_items(id).
--
-- After 20260723210000_seed_tool_asset_items.sql, 1298 units point at
-- tool_asset_items rows that mirror inventory_items 1:1 but have different
-- IDs. The master-data Tools UI now reads items from inventory_items, so
-- the units UI (which queries tool_asset_units by item_id) shows empty.
--
-- Mapping strategy: for each tool_asset_item, find the inventory_item(s)
-- in the same category whose name_en starts with the tool_asset_item's
-- name_en (inventory names carry a " — <variant>" suffix). When multiple
-- tool_asset_items share a base name in a category (e.g. two "OIL FILLED
-- PRESSURE GAUGE BOTTOM MOUNTING" rows → HP + LP variants), pair them by
-- ROW_NUMBER() ordered by id on both sides. Not semantically perfect for
-- HP-vs-LP within a duplicate group but preserves total unit count and
-- puts units under an inventory item of the right family.

BEGIN;

-- 1. Drop the current FK so we can point item_id at inventory_items(id).
ALTER TABLE public.tool_asset_units
  DROP CONSTRAINT IF EXISTS tool_asset_units_item_id_fkey;

-- 2. Build the mapping and remap.
WITH numbered_tai AS (
  SELECT
    id,
    category_id,
    name_en,
    ROW_NUMBER() OVER (PARTITION BY category_id, name_en ORDER BY id) AS rn
  FROM public.tool_asset_items
),
numbered_inv AS (
  SELECT
    ii.id            AS inv_id,
    ii.category_id,
    -- Strip the " — <variant>" suffix (em dash U+2014) to get the base name
    -- that matches the tool_asset_items row.
    SPLIT_PART(ii.name_en, ' — ', 1) AS base_name,
    ROW_NUMBER() OVER (
      PARTITION BY ii.category_id, SPLIT_PART(ii.name_en, ' — ', 1)
      ORDER BY ii.id
    ) AS rn
  FROM public.inventory_items ii
  JOIN public.inventory_categories ic ON ic.id = ii.category_id
  WHERE ic.type = 'tools'
),
mapping AS (
  SELECT n.id AS tai_id, i.inv_id
  FROM numbered_tai n
  JOIN numbered_inv i
    ON i.category_id = n.category_id
   AND i.base_name   = n.name_en
   AND i.rn          = n.rn
)
UPDATE public.tool_asset_units u
SET item_id = m.inv_id
FROM mapping m
WHERE u.item_id = m.tai_id;

-- 3. Any tool_asset_units whose item_id doesn't now resolve to a row in
--    inventory_items (i.e. an unmapped tool_asset_item, or an id that
--    was never valid) must be NULLed before we can add the new FK.
--    Report the count so it's visible in the push output.
DO $$
DECLARE
  v_unmapped INT;
BEGIN
  SELECT COUNT(*) INTO v_unmapped
  FROM public.tool_asset_units u
  WHERE u.item_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.inventory_items ii WHERE ii.id = u.item_id);

  IF v_unmapped > 0 THEN
    RAISE NOTICE 'NULLing % tool_asset_units.item_id values that don''t resolve to inventory_items', v_unmapped;
    UPDATE public.tool_asset_units u
    SET item_id = NULL
    WHERE u.item_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory_items ii WHERE ii.id = u.item_id);
  ELSE
    RAISE NOTICE 'All tool_asset_units successfully remapped to inventory_items';
  END IF;
END $$;

-- 4. Add the new FK targeting inventory_items. ON DELETE SET NULL so
--    deleting an inventory item doesn't cascade-nuke unit tracking.
ALTER TABLE public.tool_asset_units
  ADD CONSTRAINT tool_asset_units_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;

COMMIT;
