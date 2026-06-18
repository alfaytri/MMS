-- supabase/migrations/20260425000005_rpc_batch_increment_received_qty.sql

BEGIN;

-- p_updates: [{ "id": "<po_line_item_id>", "delta": <qty> }, ...]
CREATE OR REPLACE FUNCTION batch_increment_received_qty(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE po_line_items
    SET received_qty = GREATEST(0, received_qty + (rec->>'delta')::INT)
    WHERE id = (rec->>'id')::UUID;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_increment_received_qty(JSONB) TO authenticated;

COMMIT;
