-- ============================================================
-- Add unique constraints to inventory tables
--
-- Root cause: Excel import failed repeatedly because no unique
-- constraints existed. Partial imports left orphaned rows,
-- retries created duplicates, and the pipeline never completed
-- reliably. These constraints make upsert safe and prevent
-- duplicate data regardless of how many times import is retried.
-- ============================================================

BEGIN;

-- ── Step 1: Deduplicate existing data before adding constraints ──

-- 1a. inventory_categories: keep the oldest row per (lower(name_en), COALESCE(parent_id, '00000000-...'), type)
-- We use a sentinel UUID for NULL parent_id since UNIQUE treats NULLs as distinct.
DELETE FROM inventory_categories
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY lower(trim(name_en)), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), type
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM inventory_categories
  ) ranked
  WHERE rn > 1
);

-- 1b. inventory_items: keep the oldest row per (lower(name_en), category_id)
DELETE FROM inventory_items
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY lower(trim(name_en)), category_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM inventory_items
  ) ranked
  WHERE rn > 1
);

-- 1c. inventory_brand_variants: keep the oldest row per (item_id, lower(brand))
DELETE FROM inventory_brand_variants
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY item_id, lower(trim(brand))
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM inventory_brand_variants
  ) ranked
  WHERE rn > 1
);

-- ── Step 2: Add unique indexes ──

-- Categories: unique per (type, parent, name). Two indexes because
-- parent_id can be NULL and standard UNIQUE treats NULLs as distinct.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_categories_name_parent_type
  ON inventory_categories (type, parent_id, lower(trim(name_en)))
  WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_categories_name_root_type
  ON inventory_categories (type, lower(trim(name_en)))
  WHERE parent_id IS NULL;

-- Items: unique per (category, name)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_name_category
  ON inventory_items (category_id, lower(trim(name_en)));

-- Brand variants: unique per (item, brand)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_brand_variants_item_brand
  ON inventory_brand_variants (item_id, lower(trim(brand)));

COMMIT;

NOTIFY pgrst, 'reload schema';
