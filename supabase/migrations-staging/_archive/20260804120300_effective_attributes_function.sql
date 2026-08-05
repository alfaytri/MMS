-- Returns the effective attribute schema for a category — union of
-- definitions on (category_id + all ancestors) ordered by sort_order,
-- with a stable tie-break by depth (ancestors first).
CREATE OR REPLACE FUNCTION public.get_effective_attributes(p_category_id uuid)
RETURNS TABLE (
  definition_id   uuid,
  category_id     uuid,
  category_name   text,
  attribute_key   text,
  label_en        text,
  label_ar        text,
  sort_order      int,
  depth           int,
  is_inherited    boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, name_en, 0 AS depth
    FROM inventory_categories
    WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, t.depth + 1
    FROM inventory_categories c
    JOIN tree t ON t.parent_id = c.id
    WHERE t.depth < 10
  )
  SELECT
    d.id,
    d.category_id,
    t.name_en,
    d.attribute_key,
    d.label_en,
    d.label_ar,
    d.sort_order,
    t.depth,
    (t.depth > 0) AS is_inherited
  FROM inventory_attribute_definitions d
  JOIN tree t ON t.id = d.category_id
  ORDER BY d.sort_order ASC, t.depth ASC;
$$;
