-- supabase/migrations/20260425000004_rpc_update_reserved_qty.sql

BEGIN;

-- Atomically increment or decrement reserved_qty, floored at 0
CREATE OR REPLACE FUNCTION update_reserved_qty(
  p_bv_id UUID,
  p_delta  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET reserved_qty = GREATEST(0, reserved_qty + p_delta),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_reserved_qty(UUID, INT) TO authenticated;

-- Cache linked_services_count on brand_variants for LC allocation
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS linked_services_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_update_linked_services_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = linked_services_count + 1
    WHERE id = NEW.brand_variant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = GREATEST(0, linked_services_count - 1)
    WHERE id = OLD.brand_variant_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_linked_services_count ON service_inventory;
CREATE TRIGGER trg_update_linked_services_count
  AFTER INSERT OR DELETE ON service_inventory
  FOR EACH ROW EXECUTE FUNCTION fn_update_linked_services_count();

COMMIT;
