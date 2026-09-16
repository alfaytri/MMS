-- Keep warehouse_stock_summary's denormalized item metadata in sync with the
-- master catalog.
--
-- warehouse_stock_summary is a trigger-maintained CACHE, refreshed only on STOCK
-- movements (fifo_cost_layers / warehouse_stock_allocations). It copies
-- item_name / brand / sku / unit / category_name / subcategory_name / item_type
-- from inventory_items / _brand_variants / _categories at refresh time — so a
-- rename (or sku/unit/category/brand edit) never reached the cache, and the
-- Warehouses / Stock Overview screens (which read warehouse_stock_view ->
-- warehouse_stock_summary) kept the OLD name, with search-by-new-name returning
-- nothing, until the next stock movement. These triggers re-sync the cached
-- metadata on the catalog edits themselves. (A one-off UPDATE already repaired
-- the rows that were stale at deploy time.)
BEGIN;

-- Metadata-only refresh for one brand variant — cheap (no qty/cost scan), and
-- uses the SAME derivation as refresh_stock_summary_row. Updates every summary
-- row for the variant (across warehouses / sub-containers).
CREATE OR REPLACE FUNCTION public.refresh_stock_summary_metadata(p_brand_variant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE public.warehouse_stock_summary w SET
    item_name        = ii.name_en,
    brand            = bv.brand,
    sku              = ii.sku,
    unit             = ii.unit,
    category_name    = COALESCE(icp.name_en, ic.name_en),
    subcategory_name = CASE WHEN icp.id IS NOT NULL THEN ic.name_en END,
    item_type        = COALESCE(ic.type, icp.type)::text,
    updated_at       = now()
  FROM public.inventory_item_brand_variants bv
  JOIN public.inventory_items ii  ON ii.id  = bv.item_id
  LEFT JOIN public.inventory_categories ic  ON ic.id  = ii.category_id
  LEFT JOIN public.inventory_categories icp ON icp.id = ic.parent_id
  WHERE bv.id = p_brand_variant_id
    AND w.brand_variant_id = p_brand_variant_id;
END $fn$;

-- inventory_items: rename / sku / unit / category change → re-sync its variants.
CREATE OR REPLACE FUNCTION public.trg_item_stock_summary_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $fn$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.inventory_item_brand_variants WHERE item_id = NEW.id LOOP
    PERFORM public.refresh_stock_summary_metadata(r.id);
  END LOOP;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_item_stock_summary_meta ON public.inventory_items;
CREATE TRIGGER trg_item_stock_summary_meta
  AFTER UPDATE OF name_en, sku, unit, category_id ON public.inventory_items
  FOR EACH ROW WHEN (
        OLD.name_en     IS DISTINCT FROM NEW.name_en
     OR OLD.sku         IS DISTINCT FROM NEW.sku
     OR OLD.unit        IS DISTINCT FROM NEW.unit
     OR OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION public.trg_item_stock_summary_meta();

-- inventory_categories: rename → re-sync category_name / subcategory_name for
-- every summary row whose item sits directly in this category or its child.
CREATE OR REPLACE FUNCTION public.trg_category_stock_summary_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $fn$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT bv.id
    FROM public.inventory_item_brand_variants bv
    JOIN public.inventory_items ii ON ii.id = bv.item_id
    JOIN public.inventory_categories ic ON ic.id = ii.category_id
    WHERE ic.id = NEW.id OR ic.parent_id = NEW.id
  LOOP
    PERFORM public.refresh_stock_summary_metadata(r.id);
  END LOOP;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_category_stock_summary_meta ON public.inventory_categories;
CREATE TRIGGER trg_category_stock_summary_meta
  AFTER UPDATE OF name_en ON public.inventory_categories
  FOR EACH ROW WHEN (OLD.name_en IS DISTINCT FROM NEW.name_en)
  EXECUTE FUNCTION public.trg_category_stock_summary_meta();

-- inventory_item_brand_variants: brand change → re-sync that variant.
CREATE OR REPLACE FUNCTION public.trg_variant_stock_summary_meta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.refresh_stock_summary_metadata(NEW.id);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_variant_stock_summary_meta ON public.inventory_item_brand_variants;
CREATE TRIGGER trg_variant_stock_summary_meta
  AFTER UPDATE OF brand ON public.inventory_item_brand_variants
  FOR EACH ROW WHEN (OLD.brand IS DISTINCT FROM NEW.brand)
  EXECUTE FUNCTION public.trg_variant_stock_summary_meta();

COMMIT;
