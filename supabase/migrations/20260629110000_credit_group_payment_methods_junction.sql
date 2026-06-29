-- Migrate credit_groups.payment_methods text[] → junction table with FK integrity.

-- 1. Create junction table
CREATE TABLE credit_group_payment_methods (
  credit_group_id UUID NOT NULL REFERENCES credit_groups(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (credit_group_id, payment_method_id)
);

-- 2. RLS
ALTER TABLE credit_group_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read"
  ON credit_group_payment_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage"
  ON credit_group_payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Backfill from existing text[] arrays
INSERT INTO credit_group_payment_methods (credit_group_id, payment_method_id)
SELECT cg.id, pm.id
FROM credit_groups cg
CROSS JOIN LATERAL unnest(cg.payment_methods) AS m(method_slug)
JOIN payment_methods pm ON pm.slug = m.method_slug
ON CONFLICT DO NOTHING;

-- 4. Drop the old text[] column
ALTER TABLE credit_groups DROP COLUMN payment_methods;

-- 5. Simplify rename RPC — cascade no longer needed (junction uses IDs, not slugs)
CREATE OR REPLACE FUNCTION rename_payment_method(
  p_id       UUID,
  p_new_name TEXT,
  p_new_slug TEXT
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_id) THEN
    RAISE EXCEPTION 'payment method % not found', p_id;
  END IF;

  UPDATE payment_methods
     SET name = p_new_name, slug = p_new_slug
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
