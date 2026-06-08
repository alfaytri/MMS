-- Add item_type to warehouse_stock_view (from inventory_categories.type)
-- Enables filtering stock by Products / Spare Parts / Consumables / Tools

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
  COALESCE(ic_parent.name_en, ic.name_en)                                    AS category_name,
  ic.type::text                                                               AS item_type
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv      ON ibv.id       = f.brand_variant_id
JOIN   inventory_items ii                ON ii.id        = ibv.item_id
LEFT JOIN inventory_categories ic        ON ic.id        = ii.category_id
LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY
  f.warehouse_id, f.brand_variant_id,
  ic_parent.name_en, ic.name_en, ic.type,
  ii.name_en, ibv.brand, ii.sku, ii.unit;

GRANT SELECT ON warehouse_stock_view TO authenticated;
