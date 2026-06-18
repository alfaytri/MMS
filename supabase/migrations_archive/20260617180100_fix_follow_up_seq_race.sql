-- Make per-year sequence creation race-safe via CREATE SEQUENCE IF NOT EXISTS.
-- Two concurrent calls on Jan 1 of a new year could otherwise both attempt CREATE
-- SEQUENCE and one would fail with duplicate_object.

CREATE OR REPLACE FUNCTION next_follow_up_request_number()
RETURNS TEXT
LANGUAGE plpgsql
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
