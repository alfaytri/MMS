BEGIN;

-- Fix PO-direct payments that were inserted without direction='outgoing'.
-- Root cause: useCreatePOPayment omitted the direction field, causing rows
-- to inherit the column default ('incoming'), making them appear on the
-- Invoice Payments page instead of Purchase Payments.

UPDATE payments
SET direction = 'outgoing'
WHERE source_type = 'purchase_order'
  AND direction != 'outgoing';

-- Also backfill missing SPAY- payment_ids for those same rows.
-- Uses a row_number ordered by date so the sequence is chronological.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY date, created_at) AS rn
  FROM payments
  WHERE source_type = 'purchase_order'
    AND (payment_id IS NULL OR payment_id NOT LIKE 'SPAY-%')
)
UPDATE payments p
SET payment_id = 'SPAY-' || LPAD(r.rn::text, 5, '0')
FROM ranked r
WHERE p.id = r.id;

COMMIT;
