-- supabase/migrations/20260511100002_orders_service_customer_backfill.sql
-- Migration A: Add service_customer_id (nullable) to orders, quotations, site_visits.
-- Backfill via legacy_customer_id — exact UUID mapping, no name-based joins.
-- Old customer_id column is NOT dropped here — see Migration B (Task 15).

-- ── 1. Add nullable service_customer_id columns ───────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

-- ── 2. Insert one service_customers row per distinct old customer_id ──────────
-- legacy_customer_id stores the old PK for exact reverse-mapping below.
INSERT INTO public.service_customers (name, name_ar, legacy_customer_id)
SELECT DISTINCT ON (c.id)
  COALESCE(c.name, 'Unknown'),
  c.name_ar,
  c.id
FROM public.customers c
WHERE c.id IN (
  SELECT customer_id FROM public.orders      WHERE customer_id IS NOT NULL
  UNION
  SELECT customer_id FROM public.quotations  WHERE customer_id IS NOT NULL
  UNION
  SELECT customer_id FROM public.site_visits WHERE customer_id IS NOT NULL
)
ON CONFLICT DO NOTHING;

-- ── 3. Backfill phones (one primary per customer from customers.phone) ─────────
INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
SELECT DISTINCT ON (sc.id)
  sc.id,
  c.phone,
  'mobile',
  true
FROM public.service_customers sc
JOIN public.customers c ON c.id = sc.legacy_customer_id
WHERE c.phone IS NOT NULL
  AND c.phone <> ''
ON CONFLICT DO NOTHING;

-- ── 4. Map orders → service_customer_id via legacy_customer_id ────────────────
UPDATE public.orders o
   SET service_customer_id = sc.id
  FROM public.service_customers sc
 WHERE sc.legacy_customer_id = o.customer_id
   AND o.service_customer_id IS NULL;

-- ── 5. Map quotations → service_customer_id via legacy_customer_id ───────────
UPDATE public.quotations q
   SET service_customer_id = sc.id
  FROM public.service_customers sc
 WHERE sc.legacy_customer_id = q.customer_id
   AND q.service_customer_id IS NULL;

-- ── 6. Map site_visits → service_customer_id via legacy_customer_id ─────────
UPDATE public.site_visits sv
   SET service_customer_id = sc.id
  FROM public.service_customers sc
 WHERE sc.legacy_customer_id = sv.customer_id
   AND sv.service_customer_id IS NULL;

-- ── 7. Validate backfill is complete then set NOT NULL ────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE service_customer_id IS NULL AND customer_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Backfill incomplete: some orders still have NULL service_customer_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quotations WHERE service_customer_id IS NULL AND customer_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Backfill incomplete: some quotations still have NULL service_customer_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.site_visits WHERE service_customer_id IS NULL AND customer_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Backfill incomplete: some site_visits still have NULL service_customer_id';
  END IF;

  ALTER TABLE public.orders      ALTER COLUMN service_customer_id SET NOT NULL;
  ALTER TABLE public.quotations  ALTER COLUMN service_customer_id SET NOT NULL;
  ALTER TABLE public.site_visits ALTER COLUMN service_customer_id SET NOT NULL;
END;
$$;
