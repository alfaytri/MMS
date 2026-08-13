BEGIN;
DROP INDEX IF EXISTS public.uq_inventory_brand_variants_item_brand;
CREATE UNIQUE INDEX IF NOT EXISTS uq_iibv_item_brand_origin
  ON public.inventory_item_brand_variants (item_id, brand_id, country_id)
  NULLS NOT DISTINCT;
COMMIT;
NOTIFY pgrst, 'reload schema';
