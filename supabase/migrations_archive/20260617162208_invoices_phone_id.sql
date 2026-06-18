-- ============================================================================
-- Migration: Add phone_id to invoices + backfill from source records
-- Purpose:  Enables grouping invoices by which phone number generated them
--           (e.g. on the Pending Payments customer-detail view). The
--           customer_invoices view auto-inherits the column via SELECT *.
-- ============================================================================

-- ─── 1. Schema ──────────────────────────────────────────────────────────────

ALTER TABLE public.invoices
  ADD COLUMN phone_id UUID
    REFERENCES public.customer_phones(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.phone_id IS
  'Phone number the invoice was generated from. Populated from the source '
  'record (orders.phone_id, contracts.phone_id) at creation time. NULL '
  'means no phone trail exists (manual invoices, sale-order invoices, etc.).';

-- Partial index — we only ever query phone_id on AR rows
-- (customer_invoices view = invoices WHERE direction = ''ar'')
CREATE INDEX IF NOT EXISTS idx_invoices_customer_phone_ar
  ON public.invoices (customer_id, phone_id)
  WHERE direction = 'ar';

-- ─── 2. Backfill from source records ────────────────────────────────────────

-- invoices.source_id is TEXT; the FK targets are UUID. Cast with a regex
-- guard so a malformed source_id doesn't crash the UPDATE.

-- Order-sourced invoices: orders has no phone_id column, only free-text
-- arrival_phone. Match it to customer_phones.phone via digits-only
-- normalization, scoped to the same customer.
UPDATE public.invoices i
SET    phone_id = cp.id
FROM   public.orders o
JOIN   public.customer_phones cp
       ON  cp.customer_id = o.customer_id
       AND regexp_replace(cp.phone, '\D', '', 'g')
         = regexp_replace(o.arrival_phone, '\D', '', 'g')
WHERE  i.source = 'order'
  AND  i.source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND  i.source_id::uuid = o.id
  AND  o.arrival_phone IS NOT NULL
  AND  i.phone_id IS NULL
  AND  i.direction = 'ar';

-- Contract-sourced invoices: contracts.phone_id is a direct FK.
UPDATE public.invoices i
SET    phone_id = c.phone_id
FROM   public.contracts c
WHERE  i.source = 'contract'
  AND  i.source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND  i.source_id::uuid = c.id
  AND  c.phone_id IS NOT NULL
  AND  i.phone_id IS NULL
  AND  i.direction = 'ar';

-- Sale-order-sourced invoices have NO phone_id in sale_orders, so they stay
-- NULL (rendered under the "Other" section in the UI).

-- Receival / purchase / manual invoices likewise stay NULL — no phone trail.

-- ─── Verification (read-only, prints to migration log) ──────────────────────

DO $$
DECLARE
  total_ar   bigint;
  attributed bigint;
BEGIN
  SELECT COUNT(*) INTO total_ar
    FROM public.invoices WHERE direction = 'ar';
  SELECT COUNT(*) INTO attributed
    FROM public.invoices WHERE direction = 'ar' AND phone_id IS NOT NULL;
  RAISE NOTICE 'AR invoices: % total, % attributed (%.1f%%)',
    total_ar, attributed,
    CASE WHEN total_ar > 0 THEN (attributed::numeric / total_ar * 100) ELSE 0 END;
END $$;
