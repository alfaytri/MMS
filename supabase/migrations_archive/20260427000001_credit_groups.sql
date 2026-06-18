-- supabase/migrations/20260427000001_credit_groups.sql
BEGIN;

CREATE TABLE credit_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read credit_groups"
  ON credit_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert credit_groups"
  ON credit_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update credit_groups"
  ON credit_groups FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated can delete credit_groups"
  ON credit_groups FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_credit_groups
  BEFORE UPDATE ON credit_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a default group — existing customers are backfilled below
INSERT INTO credit_groups (name, credit_limit)
VALUES ('Standard', 50000);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_group_id UUID REFERENCES credit_groups(id);

-- Backfill every existing customer to the default group atomically
UPDATE customers
SET    credit_group_id = (SELECT id FROM credit_groups WHERE name = 'Standard')
WHERE  credit_group_id IS NULL;

-- Server-side count view: never download the whole customer table to the browser
-- just to count group membership.
CREATE VIEW credit_group_customer_counts AS
  SELECT
    credit_group_id,
    COUNT(*)::INT AS customer_count
  FROM   customers
  WHERE  credit_group_id IS NOT NULL
  GROUP  BY credit_group_id;

GRANT SELECT ON credit_group_customer_counts TO authenticated;

COMMIT;
