-- Seed a permanent "Cash Customers" credit group for walk-in / one-off cash sales.
-- Uses INSERT … ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO credit_groups (id, name, credit_limit, payment_methods, max_days)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Cash Customers',
  0,
  ARRAY['cash', 'pos'],
  0
)
ON CONFLICT (id) DO NOTHING;
