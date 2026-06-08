-- Fix: restore allocated_qty/available_qty that were dropped by 20260607211057.
-- Also adds subcategory_name.

DROP VIEW IF EXISTS warehouse_stock_view;

CREATE VIEW warehouse_stock_view AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ii.name_en                                                                      AS item_name,
  ibv.brand,
  ii.sku,
  ii.unit,
  SUM(f.remaining_qty)::INT                                                       AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END                                                                             AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost)                                        AS total_value,
  COALESCE(ic_parent.name_en, ic.name_en)                                        AS category_name,
  CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en ELSE NULL END               AS subcategory_name,
  COALESCE(ic.type, ic_parent.type)::text                                        AS item_type,
  COALESCE(wsa.allocated_qty, 0)                                                 AS allocated_qty,
  GREATEST(SUM(f.remaining_qty)::INT - COALESCE(wsa.allocated_qty, 0), 0)        AS available_qty
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv      ON ibv.id       = f.brand_variant_id
JOIN   inventory_items ii                ON ii.id        = ibv.item_id
LEFT JOIN inventory_categories ic        ON ic.id        = ii.category_id
LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
LEFT JOIN warehouse_stock_allocations wsa
       ON wsa.warehouse_id     = f.warehouse_id
      AND wsa.brand_variant_id = f.brand_variant_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY
  f.warehouse_id, f.brand_variant_id,
  ic_parent.id, ic_parent.name_en, ic.name_en,
  ic.type, ic_parent.type,
  ii.name_en, ibv.brand, ii.sku, ii.unit,
  wsa.allocated_qty;

GRANT SELECT ON warehouse_stock_view TO authenticated;

NOTIFY pgrst, 'reload schema';
