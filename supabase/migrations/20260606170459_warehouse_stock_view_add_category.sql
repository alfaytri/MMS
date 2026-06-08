-- Add category_name to warehouse_stock_view
-- Joins inventory_categories (direct) and its parent to expose the top-level
-- category (e.g. "Water Heater") as Level 1 of the stock tree.
--
-- Level 1: category_name  = COALESCE(parent category, direct category)
-- Level 2: item_name      = inventory_items.name_en  (e.g. "80 Gallon")
-- Level 3: brand          = inventory_brand_variants.brand

-- DROP first so we can add a new column without position conflicts
DROP VIEW IF EXISTS warehouse_stock_view;

CREATE VIEW warehouse_stock_view AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ii.name_en                                                                  AS item_name,
  ibv.brand,
  ii.sku,
  ii.unit,
  SUM(f.remaining_qty)                                                        AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END                                                                         AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost)                                    AS total_value,
  -- New: top-level category for the 3-level stock tree
  COALESCE(ic_parent.name_en, ic.name_en)                                    AS category_name
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv      ON ibv.id      = f.brand_variant_id
JOIN   inventory_items ii                ON ii.id       = ibv.item_id
LEFT JOIN inventory_categories ic        ON ic.id       = ii.category_id
LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY
  f.warehouse_id, f.brand_variant_id,
  ic_parent.name_en, ic.name_en,
  ii.name_en, ibv.brand, ii.sku, ii.unit;

GRANT SELECT ON warehouse_stock_view TO authenticated;
