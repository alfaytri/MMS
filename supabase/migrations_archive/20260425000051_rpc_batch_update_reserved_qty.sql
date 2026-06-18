-- supabase/migrations/20260425000005b_rpc_batch_update_reserved_qty.sql

BEGIN;

-- p_updates: [{ "bv_id": "<brand_variant_id>", "delta": <qty> }, ...]
CREATE OR REPLACE FUNCTION batch_update_reserved_qty(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE inventory_brand_variants
    SET reserved_qty = GREATEST(0, reserved_qty + (rec->>'delta')::INT),
        updated_at   = now()
    WHERE id = (rec->>'bv_id')::UUID;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_update_reserved_qty(JSONB) TO authenticated;

COMMIT;
