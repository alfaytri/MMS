-- Create a proper sequence for PO numbers to prevent race-condition duplicates.
-- Previously, the client counted existing POs and incremented — two concurrent
-- creates could generate the same number. The UNIQUE constraint caught it, but
-- the second user saw an error and had to retry.

-- 1. Seed the sequence from the current max PO number.
DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN po_number ~ '^PO-[0-9]+$'
        THEN CAST(REPLACE(po_number, 'PO-', '') AS INT)
        ELSE 0
      END
    ), 0
  ) INTO v_max
  FROM purchase_orders;

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS po_number_seq START WITH %s', v_max + 1);
END $$;

-- 2. Helper function: returns next PO number as PO-00001 format.
CREATE OR REPLACE FUNCTION next_po_number()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'PO-' || LPAD(nextval('po_number_seq')::TEXT, 5, '0');
$$;

GRANT EXECUTE ON FUNCTION next_po_number() TO authenticated;
