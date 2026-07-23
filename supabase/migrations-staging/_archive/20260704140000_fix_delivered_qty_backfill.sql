-- Fix backfill: the previous migration skipped delivery items with NULL brand_variant_id.
-- This version also handles matching by item_name when brand_variant_id is NULL.

-- Step 1: Backfill by brand_variant_id (non-null)
WITH delivered_items AS (
  SELECT
    sd.sale_order_id,
    (item->>'brand_variant_id')::UUID AS brand_variant_id,
    SUM((item->>'qty_delivered')::INT) AS total_delivered
  FROM sale_deliveries sd,
       jsonb_array_elements(sd.items) AS item
  WHERE sd.status = 'delivered'
    AND (item->>'brand_variant_id') IS NOT NULL
    AND (item->>'qty_delivered')::INT > 0
  GROUP BY sd.sale_order_id, (item->>'brand_variant_id')::UUID
)
UPDATE sale_order_lines sol
SET delivered_qty = di.total_delivered
FROM delivered_items di
WHERE sol.sale_order_id = di.sale_order_id
  AND sol.brand_variant_id = di.brand_variant_id;

-- Step 2: Backfill by item_name for items without brand_variant_id
WITH delivered_items_by_name AS (
  SELECT
    sd.sale_order_id,
    item->>'item_name' AS item_name,
    SUM((item->>'qty_delivered')::INT) AS total_delivered
  FROM sale_deliveries sd,
       jsonb_array_elements(sd.items) AS item
  WHERE sd.status = 'delivered'
    AND (item->>'brand_variant_id') IS NULL
    AND (item->>'qty_delivered')::INT > 0
  GROUP BY sd.sale_order_id, item->>'item_name'
)
UPDATE sale_order_lines sol
SET delivered_qty = di.total_delivered
FROM delivered_items_by_name di
WHERE sol.sale_order_id = di.sale_order_id
  AND sol.item_name = di.item_name
  AND sol.brand_variant_id IS NULL
  AND COALESCE(sol.delivered_qty, 0) = 0;

-- Step 3: Re-run SO status backfill with corrected delivered_qty
WITH so_delivery_status AS (
  SELECT
    sol.sale_order_id,
    bool_and(COALESCE(sol.delivered_qty, 0) >= sol.qty) AS all_delivered,
    bool_or(COALESCE(sol.delivered_qty, 0) > 0) AS any_delivered
  FROM sale_order_lines sol
  JOIN sale_orders so ON so.id = sol.sale_order_id
  WHERE so.deleted_at IS NULL
    AND so.status NOT IN ('cancelled', 'invoiced', 'closed')
  GROUP BY sol.sale_order_id
)
UPDATE sale_orders so
SET    status = CASE
         WHEN sds.all_delivered THEN 'delivered'::sale_order_status
         WHEN sds.any_delivered THEN 'partial_delivery'::sale_order_status
         ELSE so.status
       END,
       updated_at = now()
FROM so_delivery_status sds
WHERE so.id = sds.sale_order_id
  AND (
    (sds.all_delivered AND so.status <> 'delivered')
    OR (sds.any_delivered AND NOT sds.all_delivered AND so.status NOT IN ('delivered', 'partial_delivery'))
  );
