-- Create a proper sequence for delivery numbers to prevent duplicate key errors.
-- Previously, three separate code paths generated DEL-XXXXX by querying the max
-- existing number and incrementing — a classic race condition.

-- 1. Find the current max delivery number to seed the sequence.
DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN delivery_number ~ '^DEL-[0-9]+$'
        THEN CAST(REPLACE(delivery_number, 'DEL-', '') AS INT)
        ELSE 0
      END
    ), 0
  ) INTO v_max
  FROM sale_deliveries;

  -- Create sequence starting after the current max
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS delivery_number_seq START WITH %s', v_max + 1);
END $$;

-- 2. Helper function: returns next delivery number as DEL-00001 format.
CREATE OR REPLACE FUNCTION next_delivery_number()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'DEL-' || LPAD(nextval('delivery_number_seq')::TEXT, 5, '0');
$$;

GRANT EXECUTE ON FUNCTION next_delivery_number() TO authenticated;
