-- Ensure po_line_items.id always has a server-side default so inserts
-- that omit the id column never produce a NOT NULL violation.
ALTER TABLE po_line_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
