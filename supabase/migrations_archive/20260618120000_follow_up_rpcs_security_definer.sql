-- Re-create both follow-up id-generation RPCs as SECURITY DEFINER so the
-- CREATE SEQUENCE IF NOT EXISTS inside the function body runs with the
-- function owner's privileges (postgres / migration user) rather than the
-- caller's. The caller — authenticated user OR service_role — typically does
-- NOT have CREATE on schema public, which would otherwise fail with
-- "permission denied for schema public".
--
-- search_path is fixed so a malicious caller can't shadow format / nextval /
-- CREATE SEQUENCE with their own schema.

CREATE OR REPLACE FUNCTION next_follow_up_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  yr   INT := EXTRACT(YEAR FROM now())::INT;
  seq  INT;
  seq_name TEXT := 'follow_up_request_seq_' || yr;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FUR-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION next_follow_up_order_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  yr       INT  := EXTRACT(YEAR  FROM now())::INT;
  mo       INT  := EXTRACT(MONTH FROM now())::INT;
  seq      INT;
  seq_name TEXT := 'follow_up_order_seq_' || yr || '_' || LPAD(mo::TEXT, 2, '0');
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FU/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_follow_up_request_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION next_follow_up_order_id()       TO authenticated, service_role;
