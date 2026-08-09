BEGIN;

-- 1. Origin dimension (country_codes.id is integer, not uuid)
ALTER TABLE public.inventory_item_brand_variants
  ADD COLUMN IF NOT EXISTS country_id integer
  REFERENCES public.country_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inventory_item_brand_variants_country_id_idx
  ON public.inventory_item_brand_variants (country_id);

-- 2a. Pre-merge case/whitespace-duplicate brand rows so the unique index below can build.
--     Keep the most-referenced row per normalized name (ties -> lowest id), re-point any
--     variants off the duplicates, then delete the now-unreferenced dups. Live data has
--     case-only dups (HOMMER/Hommer, FREGO/Frego, china/CHINA); each dup has zero variants.
UPDATE public.inventory_item_brand_variants v
SET brand_id = keep.keeper_id
FROM (
  SELECT b.id AS dup_id,
         first_value(b.id) OVER (
           PARTITION BY lower(trim(b.name))
           ORDER BY (SELECT count(*) FROM public.inventory_item_brand_variants x WHERE x.brand_id = b.id) DESC, b.id
         ) AS keeper_id
  FROM public.brands b
) keep
WHERE v.brand_id = keep.dup_id
  AND keep.dup_id <> keep.keeper_id;

DELETE FROM public.brands b
WHERE b.id IN (
  SELECT dup_id FROM (
    SELECT b2.id AS dup_id,
           first_value(b2.id) OVER (
             PARTITION BY lower(trim(b2.name))
             ORDER BY (SELECT count(*) FROM public.inventory_item_brand_variants x WHERE x.brand_id = b2.id) DESC, b2.id
           ) AS keeper_id
    FROM public.brands b2
  ) g
  WHERE g.dup_id <> g.keeper_id
);

-- 2. brands: case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_lower_name
  ON public.brands (lower(trim(name)));

-- 3. FIFO FK: CASCADE -> RESTRICT (block silent cost-history wipe)
ALTER TABLE public.fifo_cost_layers
  DROP CONSTRAINT IF EXISTS fifo_cost_layers_brand_variant_id_fkey;
ALTER TABLE public.fifo_cost_layers
  ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey
  FOREIGN KEY (brand_variant_id)
  REFERENCES public.inventory_item_brand_variants(id) ON DELETE RESTRICT;

-- 4. updated_at triggers (set_updated_at() already exists in baseline)
DROP TRIGGER IF EXISTS set_updated_at_inventory_categories ON public.inventory_categories;
CREATE TRIGGER set_updated_at_inventory_categories BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_inventory_items ON public.inventory_items;
CREATE TRIGGER set_updated_at_inventory_items BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_inventory_item_brand_variants ON public.inventory_item_brand_variants;
CREATE TRIGGER set_updated_at_inventory_item_brand_variants BEFORE UPDATE ON public.inventory_item_brand_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Drop dead markup_percent column
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS markup_percent;

-- 6. Brand rename propagates to denormalized variant text (fills the reverse-sync gap)
CREATE OR REPLACE FUNCTION public.brands_propagate_name_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.inventory_item_brand_variants
      SET brand = NEW.name
    WHERE brand_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS brands_propagate_name_trg ON public.brands;
CREATE TRIGGER brands_propagate_name_trg AFTER UPDATE OF name ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.brands_propagate_name_fn();

COMMIT;
NOTIFY pgrst, 'reload schema';
