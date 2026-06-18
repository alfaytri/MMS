-- Multi-date visit support: store all selected dates as a JSON array
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS visit_dates jsonb DEFAULT '[]'::jsonb;

-- Phone number the team should call on arrival
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS arrival_phone text;

-- File/image attachments: array of {url, name, type} objects
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
