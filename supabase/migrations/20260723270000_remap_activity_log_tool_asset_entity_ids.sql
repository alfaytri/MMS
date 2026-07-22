-- Remap activity_log rows with entity_type='tool_asset' from
-- tool_asset_items(id) to the corresponding inventory_items(id) and
-- retag entity_type='inventory_item' so the frontend audit resolver
-- can look them up after tool_asset_items is dropped.
--
-- Same (category_id, base_name, row_number) pairing as the
-- tool_asset_units remap on 2026-07-23.

BEGIN;

WITH numbered_tai AS (
  SELECT id, category_id, name_en,
         ROW_NUMBER() OVER (PARTITION BY category_id, name_en ORDER BY id) AS rn
  FROM public.tool_asset_items
),
numbered_inv AS (
  SELECT ii.id AS inv_id, ii.category_id,
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
  SELECT n.id::text AS tai_id, i.inv_id::text AS inv_id
  FROM numbered_tai n
  JOIN numbered_inv i
    ON i.category_id = n.category_id
   AND i.base_name   = n.name_en
   AND i.rn          = n.rn
)
UPDATE public.activity_log a
SET    entity_id   = m.inv_id::uuid,
       entity_type = 'inventory_item'
FROM   mapping m
WHERE  a.entity_type = 'tool_asset'
  AND  a.entity_id::text = m.tai_id;

DO $$
DECLARE v_orphans INT;
BEGIN
  SELECT COUNT(*) INTO v_orphans FROM public.activity_log
    WHERE entity_type = 'tool_asset';
  IF v_orphans > 0 THEN
    RAISE NOTICE '% activity_log rows still tagged entity_type=tool_asset (unmapped); leaving in place', v_orphans;
  ELSE
    RAISE NOTICE 'activity_log tool_asset remap complete';
  END IF;
END $$;

COMMIT;
