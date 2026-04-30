-- Safety re-run of customer_id backfill introduced in 20260430120000.
-- Idempotent: only touches rows where customer_id is still NULL.

UPDATE payments p
SET customer_id = i.customer_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.direction = 'incoming'
  AND p.customer_id IS NULL;

UPDATE payments p
SET customer_id = so.customer_id
FROM sale_orders so
WHERE p.source_type = 'sale_order'
  AND p.source_id   = so.id
  AND p.direction   = 'incoming'
  AND p.customer_id IS NULL;
