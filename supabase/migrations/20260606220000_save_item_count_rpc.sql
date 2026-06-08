-- RPC that saves a counted quantity on an inventory check item.
-- Using an RPC bypasses PostgREST's schema cache, so new columns
-- (variance_type, etc.) are always writable without waiting for a cache refresh.
-- NOTE: `variance` is a generated column — do not write to it; the DB computes it.

CREATE OR REPLACE FUNCTION save_inventory_check_item_count(
  p_item_id      uuid,
  p_counted_qty  numeric,
  p_variance_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE inventory_check_items
  SET
    counted_qty   = p_counted_qty,
    is_counted    = true,
    variance_type = p_variance_type,
    updated_at    = now()
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_inventory_check_item_count TO authenticated;
