BEGIN;

-- Catch-all: assign SPAY- IDs to every outgoing payment that still has no payment_id,
-- regardless of source_type. Previous migrations only covered source_type='purchase_order'.
WITH max_seq AS (
  SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id FROM 6) AS integer)), 0) AS n
  FROM payments
  WHERE payment_id ~ '^SPAY-\d+$'
),
numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY date, created_at) AS rn
  FROM payments
  WHERE direction = 'outgoing'
    AND (payment_id IS NULL OR payment_id NOT LIKE 'SPAY-%')
)
UPDATE payments p
SET payment_id = 'SPAY-' || LPAD((m.n + numbered.rn)::text, 5, '0')
FROM numbered, max_seq m
WHERE p.id = numbered.id;

COMMIT;
