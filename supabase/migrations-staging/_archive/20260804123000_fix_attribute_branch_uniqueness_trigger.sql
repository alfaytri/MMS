-- Fix: the outer SELECTs referenced alias "c" which only exists inside the
-- recursive CTE, causing every INSERT to fail with 42P01
-- "missing FROM-clause entry for table c". Use "a" (the ancestors/descendants
-- CTE alias) instead.
CREATE OR REPLACE FUNCTION public._check_attribute_key_branch_unique()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conflict_category text;
BEGIN
  -- Ancestors
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, a.depth + 1
    FROM public.inventory_categories c
    JOIN ancestors a ON a.parent_id = c.id
    WHERE a.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM ancestors a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  WHERE a.depth > 1                     -- exclude the row's own category (depth 1) — that's the local UNIQUE's job
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at ancestor category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  -- Descendants
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE parent_id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, d.depth + 1
    FROM public.inventory_categories c
    JOIN descendants d ON c.parent_id = d.id
    WHERE d.depth < 10
  )
  SELECT a.name_en INTO v_conflict_category
  FROM descendants a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at descendant category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
