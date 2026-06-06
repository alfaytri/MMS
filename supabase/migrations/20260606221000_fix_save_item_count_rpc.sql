-- Fix: drop the previous version (which tried to write to the generated `variance` column)
-- and recreate without the p_variance parameter.

DROP FUNCTION IF EXISTS save_inventory_check_item_count(uuid, numeric, numeric, text);

CREATE OR REPLACE FUNCTION save_inventory_check_item_count(
  p_item_id       uuid,
  p_counted_qty   numeric,
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

GRANT EXECUTE ON FUNCTION save_inventory_check_item_count(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
