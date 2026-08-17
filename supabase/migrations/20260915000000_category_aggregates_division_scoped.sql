-- Inventory list: make the category STOCK aggregates division-aware.
--
-- Before: get_category_stock_aggregates(p_type) rolled up the GLOBAL variant
-- columns (inventory_item_brand_variants.stock_level / reserved_qty / …), so the
-- Master-Data Inventory list showed company-wide stock even when the top-bar
-- division filter was active.
--
-- After: an optional p_division_ids uuid[] param. When NULL (the default, and
-- what the "All divisions" view passes) behaviour is byte-for-byte the same —
-- the global variant columns. When a division set is passed, good-stock / qty /
-- reserved / value / avg-cost are rolled up from warehouse_stock_summary via
-- sub_container -> division, so the numbers reflect only the selected
-- division(s)' pool. damaged / incoming / variant_count stay global on purpose:
-- damaged stock is tracked per WAREHOUSE (inventory_damaged_stock has no
-- sub-container/division), so it can't be attributed to a division reliably —
-- the UI labels it as company-wide.
--
-- Arg count changes (adds p_division_ids), so the old 1-arg overload must be
-- dropped first — otherwise a 1-arg call is ambiguous against the new
-- defaulted 2-arg signature.

DROP FUNCTION IF EXISTS public.get_category_stock_aggregates(text);

CREATE OR REPLACE FUNCTION public.get_category_stock_aggregates(p_type text, p_division_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(category_id uuid, total_stock bigint, total_reserved bigint, total_damaged bigint, total_incoming bigint, avg_cost numeric, variant_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  leaf_cats AS (
    SELECT id FROM inventory_categories
    WHERE type = p_type::inventory_type AND status <> 'archived'
  ),
  -- Global per-leaf figures. Always the source for damaged / incoming /
  -- variant_count, and for stock / reserved / value when no division filter.
  leaf_global AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(ibv.stock_level), 0)                    AS total_stock,
      COALESCE(SUM(ibv.reserved_qty), 0)                   AS total_reserved,
      COALESCE(SUM(ibv.damaged_qty), 0)                    AS total_damaged,
      COALESCE(SUM(ibv.incoming), 0)                       AS total_incoming,
      COALESCE(SUM(ibv.average_cost * ibv.stock_level), 0) AS value_num,
      COALESCE(SUM(ibv.stock_level), 0)                    AS cost_denom,
      COUNT(ibv.id)                                        AS variant_count
    FROM inventory_items ii
    JOIN inventory_item_brand_variants ibv ON ibv.item_id = ii.id
    WHERE ii.status <> 'archived' AND ibv.status <> 'archived'
    GROUP BY ii.category_id
  ),
  -- Division-scoped per-leaf good stock from warehouse_stock_summary
  -- (sub_container -> division). Only populated when p_division_ids is set.
  leaf_scoped AS (
    SELECT
      ii.category_id,
      COALESCE(SUM(wss.qty), 0)           AS total_stock,
      COALESCE(SUM(wss.allocated_qty), 0) AS total_reserved,
      COALESCE(SUM(wss.total_value), 0)   AS value_num,
      COALESCE(SUM(wss.qty), 0)           AS cost_denom
    FROM warehouse_stock_summary wss
    JOIN inventory_item_brand_variants ibv ON ibv.id = wss.brand_variant_id
    JOIN inventory_items ii ON ii.id = ibv.item_id
    JOIN warehouse_sub_containers wsc ON wsc.id = wss.sub_container_id
    WHERE p_division_ids IS NOT NULL
      AND ii.status <> 'archived' AND ibv.status <> 'archived'
      AND wsc.division_id = ANY(p_division_ids)
    GROUP BY ii.category_id
  ),
  -- Merge: scoped stock / reserved / value when a division filter is active,
  -- else global. Damaged / incoming / variant_count always global.
  leaf_stock AS (
    SELECT
      lg.category_id,
      CASE WHEN p_division_ids IS NULL THEN lg.total_stock    ELSE COALESCE(ls.total_stock, 0)    END AS total_stock,
      CASE WHEN p_division_ids IS NULL THEN lg.total_reserved ELSE COALESCE(ls.total_reserved, 0) END AS total_reserved,
      lg.total_damaged,
      lg.total_incoming,
      CASE WHEN p_division_ids IS NULL THEN lg.value_num  ELSE COALESCE(ls.value_num, 0)  END AS value_num,
      CASE WHEN p_division_ids IS NULL THEN lg.cost_denom ELSE COALESCE(ls.cost_denom, 0) END AS cost_denom,
      lg.variant_count
    FROM leaf_global lg
    LEFT JOIN leaf_scoped ls ON ls.category_id = lg.category_id
  ),
  -- Expand each leaf's figures up to every ancestor (including itself).
  ancestors_expanded AS (
    SELECT
      ancestor.id AS ancestor_id,
      lsm.total_stock, lsm.total_reserved, lsm.total_damaged, lsm.total_incoming,
      lsm.value_num, lsm.cost_denom, lsm.variant_count
    FROM leaf_stock lsm
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
    ) ancestor ON ancestor.leaf_id = lsm.category_id
  )
  SELECT
    ae.ancestor_id AS category_id,
    SUM(ae.total_stock)::BIGINT    AS total_stock,
    SUM(ae.total_reserved)::BIGINT AS total_reserved,
    SUM(ae.total_damaged)::BIGINT  AS total_damaged,
    SUM(ae.total_incoming)::BIGINT AS total_incoming,
    CASE WHEN SUM(ae.cost_denom) > 0
      THEN ROUND(SUM(ae.value_num) / SUM(ae.cost_denom), 2)
      ELSE 0
    END AS avg_cost,
    SUM(ae.variant_count)::BIGINT  AS variant_count
  FROM ancestors_expanded ae
  GROUP BY ae.ancestor_id;
$function$;

NOTIFY pgrst, 'reload schema';
