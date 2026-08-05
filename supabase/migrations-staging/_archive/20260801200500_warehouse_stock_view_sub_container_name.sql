-- Warehouse Model v2 — Phase D.10 Task 1
--
-- Expose `sub_container_name` on `warehouse_stock_view` so the Stock Value /
-- Stock Overview / FifoDetail surfaces can render two-level warehouse ×
-- sub-container breakdowns without an extra client-side lookup pass.
--
-- CREATE OR REPLACE VIEW cannot rename existing columns, so the new
-- `sub_container_name` column is appended at the end. All existing
-- named-column selects in the app continue to work.

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
  wsc.name AS sub_container_name
FROM public.warehouse_stock_summary wss
LEFT JOIN public.warehouse_sub_containers wsc
  ON wsc.id = wss.sub_container_id;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
