-- Inventory Item Photos phase — Task 5 (view extension)
--
-- Expose `image_url` on `warehouse_stock_view` so every warehouse-stock-
-- fed picker in the app (WhItemPicker rows, Cascade leaf rows, damaged
-- pickers) can render the item's catalog photo without an extra lookup
-- pass.
--
-- CREATE OR REPLACE VIEW cannot rename existing columns, so the new
-- `image_url` column is appended at the end alongside the sub_container_name
-- column added in 20260801200500.
--
-- Plan: docs/plans/2026-08-03-inventory-item-photos.md.

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
  ii.image_url AS image_url
FROM public.warehouse_stock_summary wss
LEFT JOIN public.warehouse_sub_containers wsc
  ON wsc.id = wss.sub_container_id
LEFT JOIN public.inventory_item_brand_variants bv
  ON bv.id = wss.brand_variant_id
LEFT JOIN public.inventory_items ii
  ON ii.id = bv.item_id;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
