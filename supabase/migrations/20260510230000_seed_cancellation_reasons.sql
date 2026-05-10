-- Seed default cancellation reasons
INSERT INTO reason_lists (category, label, sort_order, active)
VALUES
  ('cancellation', 'Customer Request',        10, true),
  ('cancellation', 'Duplicate Order',         20, true),
  ('cancellation', 'Wrong Service Selected',  30, true),
  ('cancellation', 'Price Dispute',           40, true),
  ('cancellation', 'Team Unavailable',        50, true),
  ('cancellation', 'Customer No-Show',        60, true),
  ('cancellation', 'Service Area Not Covered',70, true),
  ('cancellation', 'Other',                   99, true)
ON CONFLICT DO NOTHING;
