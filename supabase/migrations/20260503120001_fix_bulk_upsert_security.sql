BEGIN;

CREATE OR REPLACE FUNCTION public.service_inventory_bulk_upsert(
  p_service_ids      uuid[],
  p_brand_variant_id uuid,
  p_link_type        text    DEFAULT 'supply',
  p_quantity         numeric DEFAULT 1,
  p_warranty_months  int     DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF array_length(p_service_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO service_inventory
    (service_id, brand_variant_id, link_type, quantity, warranty_months)
  SELECT
    unnest(p_service_ids),
    p_brand_variant_id,
    p_link_type,
    p_quantity,
    p_warranty_months
  ON CONFLICT (service_id, brand_variant_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.service_inventory_bulk_upsert(uuid[], uuid, text, numeric, int) TO authenticated;

COMMIT;
