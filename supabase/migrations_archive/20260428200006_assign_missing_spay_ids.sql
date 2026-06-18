-- Assign SPAY-XXXXX payment IDs to outgoing payments that have none.
-- Uses regex '^SPAY-\d+$' to safely cast only clean numeric suffixes.
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
    AND payment_id IS NULL
)
UPDATE payments p
SET payment_id = 'SPAY-' || LPAD((m.n + numbered.rn)::text, 5, '0')
FROM numbered, max_seq m
WHERE p.id = numbered.id;
