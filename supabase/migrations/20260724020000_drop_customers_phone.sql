-- Drop the legacy customers.phone scalar column.
--
-- Multi-phone support lives on customer_phones, but historical writes
-- through CustomerDialog only stamped customers.phone (never
-- customer_phones). Backfill first so no rows lose their number.
--
-- Backfill rules:
--   * For every customer whose customers.phone is NOT NULL:
--       - if the customer already has a customer_phones row with the
--         same phone value, leave it alone.
--       - if the customer already has ANY customer_phones row (even
--         with a different number), leave it alone. customers.phone is
--         considered stale.
--       - otherwise, insert a customer_phones row with is_primary=true
--         copying the phone.
--   * After backfill, drop customers.phone.

BEGIN;

-- ON CONFLICT DO NOTHING covers the case where two customers historically
-- shared the same phone (test/duplicate data). The second customer keeps no
-- customer_phones row and must have one added manually.
INSERT INTO public.customer_phones (customer_id, phone, is_primary, created_at)
SELECT c.id, c.phone, true, now()
  FROM public.customers c
 WHERE c.phone IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.customer_phones cp WHERE cp.customer_id = c.id
   )
ON CONFLICT (phone) DO NOTHING;

ALTER TABLE public.customers DROP COLUMN IF EXISTS phone;

COMMIT;
