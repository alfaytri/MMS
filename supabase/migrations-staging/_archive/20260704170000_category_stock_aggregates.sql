-- Returns aggregated stock data for all categories, rolling up from brand variants
-- through items and subcategories recursively.

CREATE OR REPLACE FUNCTION get_category_stock_aggregates(p_type text)
RETURNS TABLE (
  category_id  UUID,
  total_stock  BIGINT,
  total_reserved BIGINT,
  total_damaged BIGINT,
  total_incoming BIGINT,
  avg_cost     NUMERIC,
  variant_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE cat_tree AS (
    SELECT id, parent_id
    FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'

    UNION ALL

    SELECT child.id, child.parent_id
    FROM inventory_categories child
    JOIN cat_tree parent ON child.parent_id = parent.id
    WHERE child.status <> 'archived'
  ),
  -- Map each leaf category to all its ancestors (including itself)
  leaf_cats AS (
    SELECT id FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'
  ),
  -- Get stock per leaf category from brand variants
  leaf_stock AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(ibv.stock_level), 0) AS total_stock,
      COALESCE(SUM(ibv.reserved_qty), 0) AS total_reserved,
      COALESCE(SUM(ibv.damaged_qty), 0) AS total_damaged,
      COALESCE(SUM(ibv.incoming), 0) AS total_incoming,
      CASE WHEN COUNT(ibv.id) > 0
        THEN ROUND(SUM(ibv.average_cost * ibv.stock_level) / NULLIF(SUM(ibv.stock_level), 0), 2)
        ELSE 0
      END AS avg_cost,
      COUNT(ibv.id) AS variant_count
    FROM inventory_items ii
    JOIN inventory_brand_variants ibv ON ibv.item_id = ii.id
    WHERE ii.status <> 'archived'
      AND ibv.status <> 'archived'
    GROUP BY ii.category_id
  ),
  -- Expand: for each ancestor, sum the stock of all its descendant leaf categories
  ancestors_expanded AS (
    SELECT
      ancestor.id AS ancestor_id,
      ls.total_stock,
      ls.total_reserved,
      ls.total_damaged,
      ls.total_incoming,
      ls.avg_cost,
      ls.variant_count,
      ls.total_stock AS weighted_cost_numerator
    FROM leaf_stock ls
    JOIN (
      WITH RECURSIVE climb AS (
        SELECT id, id AS leaf_id FROM leaf_cats
        UNION ALL
        SELECT ic.parent_id, climb.leaf_id
        FROM climb
        JOIN inventory_categories ic ON ic.id = climb.id
        WHERE ic.parent_id IS NOT NULL
      )
      SELECT id AS id, leaf_id FROM climb
    ) ancestor ON ancestor.leaf_id = ls.category_id
  )
  SELECT
    ae.ancestor_id AS category_id,
    SUM(ae.total_stock)::BIGINT AS total_stock,
    SUM(ae.total_reserved)::BIGINT AS total_reserved,
    SUM(ae.total_damaged)::BIGINT AS total_damaged,
    SUM(ae.total_incoming)::BIGINT AS total_incoming,
    CASE WHEN SUM(ae.total_stock) > 0
      THEN ROUND(SUM(ae.avg_cost * ae.total_stock) / SUM(ae.total_stock), 2)
      ELSE 0
    END AS avg_cost,
    SUM(ae.variant_count)::BIGINT AS variant_count
  FROM ancestors_expanded ae
  GROUP BY ae.ancestor_id;
$$;

GRANT EXECUTE ON FUNCTION get_category_stock_aggregates(text) TO authenticated;
