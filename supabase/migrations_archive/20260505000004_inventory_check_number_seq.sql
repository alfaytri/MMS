-- Sequence + function for inventory check numbers (format: IC-YYYY-NNNNN)
CREATE SEQUENCE IF NOT EXISTS inventory_check_seq START 1;

CREATE OR REPLACE FUNCTION generate_check_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'IC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('inventory_check_seq')::TEXT, 5, '0')
$$;

GRANT EXECUTE ON FUNCTION generate_check_number() TO authenticated;
