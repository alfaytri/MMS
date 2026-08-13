-- Warehouse Origin Visibility — Task 1
-- Expose origin on warehouse_stock_view so every warehouse-stock-fed surface
-- (stock tree/overview/value, transfer picker + list + receive, movements feed,
-- reorder editor, printed report) can label the (item, brand, ORIGIN) leaf.
-- The variant `bv` is already joined; add its country_id + a country_codes name.
-- CREATE OR REPLACE VIEW cannot rename/reorder columns, so the two new columns
-- are appended at the end (same rule as 20260815001900). security_invoker kept.

CREATE OR REPLACE VIEW public.warehouse_stock_view AS
SELECT
  wss.warehouse_id,
  wss.sub_container_id,
  wss.brand_variant_id,
  wss.item_name,
  wss.brand,
  wss.sku,
  wss.unit,
  wss.qty,
  wss.avg_cost,
  wss.total_value,
  wss.category_name,
  wss.subcategory_name,
  wss.item_type,
  wss.allocated_qty,
  wss.available_qty,
  wsc.name AS sub_container_name,
  ii.image_url AS image_url,
  bv.country_id AS country_id,
  cc.name AS country_name
FROM public.warehouse_stock_summary wss
LEFT JOIN public.warehouse_sub_containers wsc
  ON wsc.id = wss.sub_container_id
LEFT JOIN public.inventory_item_brand_variants bv
  ON bv.id = wss.brand_variant_id
LEFT JOIN public.inventory_items ii
  ON ii.id = bv.item_id
LEFT JOIN public.country_codes cc
  ON cc.id = bv.country_id;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
