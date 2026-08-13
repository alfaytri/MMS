BEGIN;

-- Create a brand row for each distinct normalized brand text not already present.
INSERT INTO public.brands (name)
SELECT DISTINCT trim(v.brand)
FROM public.inventory_item_brand_variants v
WHERE v.brand IS NOT NULL
  AND trim(v.brand) <> ''
  AND lower(trim(v.brand)) NOT IN ('generic')
  AND NOT EXISTS (
    SELECT 1 FROM public.brands b
    WHERE lower(trim(b.name)) = lower(trim(v.brand))
  );

-- Map each variant to its brand row by normalized name.
UPDATE public.inventory_item_brand_variants v
SET brand_id = b.id
FROM public.brands b
WHERE v.brand_id IS NULL
  AND v.brand IS NOT NULL
  AND trim(v.brand) <> ''
  AND lower(trim(v.brand)) = lower(trim(b.name));

-- Report anything still unmapped (non-generic text with no brand_id).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.inventory_item_brand_variants
  WHERE brand_id IS NULL AND brand IS NOT NULL AND trim(brand) <> ''
    AND lower(trim(brand)) <> 'generic';
  RAISE NOTICE 'Unmapped brand-text variants remaining: %', n;
END $$;

COMMIT;
