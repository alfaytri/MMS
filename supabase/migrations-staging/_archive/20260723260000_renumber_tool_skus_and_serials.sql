-- Renumber tool SKUs + unit serials into a human-readable scheme.
--
-- Old:  inventory_items.sku = "VAC1STAG-1032" (cryptic)
--       tool_asset_units.serial_number = "TOOL-0001-001" (opaque global ordinal)
-- New:  inventory_items.sku = "VP-001"  (category-prefix + tool-ordinal)
--       tool_asset_units.serial_number = "VP-001-001" (item sku + unit-ordinal)
--
-- Also cleans obvious duplicated " — <suffix>" tails on name_en where the
-- suffix duplicates the base (e.g. "AC CLEANING COVER BAG TYPE Q-537 —
-- BAG TYPE Q-537").
--
-- Scope: inventory_items where category.type = 'tools' AND every
-- tool_asset_units row (all currently point at inventory_items rows).
-- Products / spare parts / consumables untouched.

BEGIN;

-- 1. Category → prefix mapping (stable across reruns of this migration).
CREATE TEMP TABLE _tool_cat_prefix (
  category_id uuid PRIMARY KEY,
  prefix      text NOT NULL
);

INSERT INTO _tool_cat_prefix (category_id, prefix)
SELECT id, CASE name_en
  WHEN 'AC Cleaning Covers'      THEN 'ACC'
  WHEN 'Adaptor / Quick Coupler' THEN 'AD'
  WHEN 'Clamp Meter'             THEN 'CM'
  WHEN 'Cleaning Machines'       THEN 'CLM'
  WHEN 'Flaring Tool'            THEN 'FT'
  WHEN 'Gauge'                   THEN 'GA'
  WHEN 'General'                 THEN 'GN'
  WHEN 'Hygrometer'              THEN 'HY'
  WHEN 'Manifold Gauge'          THEN 'MG'
  WHEN 'Multimeter'              THEN 'MM'
  WHEN 'Power Tools'             THEN 'PT'
  WHEN 'Pressure Washers'        THEN 'PW'
  WHEN 'Test for new Mitigation' THEN 'TST'
  WHEN 'Testing & Measurement'   THEN 'TM'
  WHEN 'Thermometer'             THEN 'TH'
  WHEN 'Tools & Equipment'       THEN 'TE'
  WHEN 'Tube Bender'             THEN 'TB'
  WHEN 'Tube Cutter'             THEN 'TC'
  WHEN 'Vacuum Pump'             THEN 'VP'
  ELSE 'TL' || SUBSTRING(id::text, 1, 4)  -- fallback for any new category
END
FROM public.inventory_categories
WHERE type = 'tools';

-- 2. Clean obvious duplicated " — <suffix>" tails.
--    Case A: suffix exactly equals base → strip entire tail
--    Case B: suffix is a substring of base (case-insensitive) → strip entire tail
UPDATE public.inventory_items ii
SET name_en = btrim(base)
FROM (
  SELECT ii2.id,
         split_part(ii2.name_en, ' — ', 1) AS base,
         NULLIF(split_part(ii2.name_en, ' — ', 2), '') AS suffix
  FROM public.inventory_items ii2
  JOIN public.inventory_categories ic ON ic.id = ii2.category_id
  WHERE ic.type = 'tools'
    AND ii2.name_en LIKE '% — %'
) x
WHERE ii.id = x.id
  AND x.suffix IS NOT NULL
  AND (
       btrim(lower(x.suffix)) = btrim(lower(x.base))
    OR btrim(lower(x.base)) ILIKE '%' || btrim(lower(x.suffix)) || '%'
  );

-- 3. Renumber inventory_items.sku for tools.
--    Ordering: created_at ASC, id ASC (stable across reruns).
WITH numbered AS (
  SELECT ii.id,
         cp.prefix,
         ROW_NUMBER() OVER (PARTITION BY ii.category_id ORDER BY ii.created_at, ii.id) AS rn
  FROM public.inventory_items ii
  JOIN _tool_cat_prefix cp ON cp.category_id = ii.category_id
)
UPDATE public.inventory_items ii
SET sku = n.prefix || '-' || LPAD(n.rn::text, 3, '0')
FROM numbered n
WHERE ii.id = n.id;

-- 4. Renumber tool_asset_units.serial_number.
--    Format: <item.sku>-<unit-ordinal-3d>
--    Ordering within an item: created_at ASC, id ASC.
WITH numbered_units AS (
  SELECT u.id,
         ii.sku AS item_sku,
         ROW_NUMBER() OVER (PARTITION BY u.item_id ORDER BY u.created_at, u.id) AS un
  FROM public.tool_asset_units u
  JOIN public.inventory_items ii ON ii.id = u.item_id
)
UPDATE public.tool_asset_units u
SET serial_number = n.item_sku || '-' || LPAD(n.un::text, 3, '0')
FROM numbered_units n
WHERE u.id = n.id;

-- 5. Sanity checks.
DO $$
DECLARE
  v_dup_sku    INT;
  v_dup_serial INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_sku FROM (
    SELECT sku FROM public.inventory_items
    WHERE sku IS NOT NULL
    GROUP BY sku HAVING COUNT(*) > 1
  ) d;
  SELECT COUNT(*) INTO v_dup_serial FROM (
    SELECT serial_number FROM public.tool_asset_units
    WHERE serial_number IS NOT NULL
    GROUP BY serial_number HAVING COUNT(*) > 1
  ) d;

  IF v_dup_sku    > 0 THEN RAISE EXCEPTION 'duplicate sku after renumber: % groups', v_dup_sku;    END IF;
  IF v_dup_serial > 0 THEN RAISE EXCEPTION 'duplicate serial after renumber: % groups', v_dup_serial; END IF;

  RAISE NOTICE 'Renumber complete: SKUs + serials all unique.';
END $$;

DROP TABLE _tool_cat_prefix;

COMMIT;
