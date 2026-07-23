-- ============================================================
-- Drop redundant warehouse_transfers.items JSON column
-- Data already lives in warehouse_transfer_items table
-- ============================================================

BEGIN;

-- Migrate any JSON items that don't yet have rows in warehouse_transfer_items
INSERT INTO public.warehouse_transfer_items (
    transfer_id, brand_variant_id, item_name, sku,
    requested_qty, unit_cost, shrinkage_qty
)
SELECT
    wt.id,
    (item->>'brand_variant_id')::uuid,
    COALESCE(item->>'item_name', 'Item'),
    item->>'sku',
    COALESCE((item->>'qty')::integer, 0),
    COALESCE((item->>'unit_cost')::numeric, 0),
    0
FROM public.warehouse_transfers wt,
     jsonb_array_elements(wt.items) AS item
WHERE wt.items IS NOT NULL
  AND jsonb_typeof(wt.items) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_transfer_items wti
    WHERE wti.transfer_id = wt.id
  );

-- Drop the JSON column
ALTER TABLE public.warehouse_transfers
  DROP COLUMN IF EXISTS items;

COMMIT;
