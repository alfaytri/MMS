-- Per-month FU/YYYY/MM/NNNN order_id sequence for follow-up orders.
-- Separate counter from N-orders so reporting is clean (FU/2026/06/0001…).

CREATE OR REPLACE FUNCTION next_follow_up_order_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  yr       INT  := EXTRACT(YEAR  FROM now())::INT;
  mo       INT  := EXTRACT(MONTH FROM now())::INT;
  seq      INT;
  seq_name TEXT := 'follow_up_order_seq_' || yr || '_' || LPAD(mo::TEXT, 2, '0');
BEGIN
  -- Lazy per-year-per-month sequence creation (idempotent across concurrent calls)
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO seq;
  RETURN 'FU/' || yr || '/' || LPAD(mo::TEXT, 2, '0') || '/' || LPAD(seq::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_follow_up_order_id() TO authenticated;
