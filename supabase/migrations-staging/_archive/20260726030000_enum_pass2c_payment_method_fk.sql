-- Enum Conversion Pass 2c: Payment method FK
--
-- Converts payments.method (text) into an FK column payments.method_id
-- referencing payment_methods(id). Text column preserved for now; sync
-- trigger keeps the FK aligned on writes. Follow-up passes will migrate
-- writers to set method_id directly and eventually drop the text column.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Seed slugs the app writes but that aren't yet in payment_methods.
--    Existing rows in the bootstrap migration only cover 'cash' and 'pos'.
-- ---------------------------------------------------------------------------

INSERT INTO public.payment_methods (name, slug, is_active, sort_order)
VALUES
  ('Bank Transfer',   'bank_transfer',   true, 3),
  ('Cheque',          'cheque',          true, 4),
  ('Online Transfer', 'online_transfer', true, 5),
  ('Store Credit',    'store_credit',    true, 6)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Legacy value normalization: some rows were written with method='online'
--    (see useCreditNotes.ts:240). Alias to the canonical 'online_transfer'
--    slug so the backfill has a matching row.
-- ---------------------------------------------------------------------------

UPDATE public.payments
SET    method = 'online_transfer'
WHERE  method = 'online';

-- ---------------------------------------------------------------------------
-- 3. Pre-flight: verify every method value maps to a payment_methods row
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT p.method, ', ') INTO bad
  FROM public.payments p
  LEFT JOIN public.payment_methods pm ON pm.slug = p.method
  WHERE p.method IS NOT NULL
    AND pm.id   IS NULL;

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'payments.method values with no matching payment_methods.slug row: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Add method_id FK column and backfill
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS method_id uuid REFERENCES public.payment_methods(id);

UPDATE public.payments p
SET    method_id = pm.id
FROM   public.payment_methods pm
WHERE  pm.slug = p.method
  AND  p.method_id IS NULL;

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.payments WHERE method_id IS NULL AND method IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'payments.method_id has % NULLs after backfill', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Sync trigger: keep method_id aligned when app code writes only text
--    (and vice versa).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._sync_payment_method_id_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.method_id IS NULL AND NEW.method IS NOT NULL THEN
    SELECT id INTO NEW.method_id FROM public.payment_methods WHERE slug = NEW.method;
    IF NEW.method_id IS NULL THEN
      RAISE EXCEPTION 'payment method slug % has no matching payment_methods row', NEW.method;
    END IF;
  ELSIF NEW.method_id IS NOT NULL AND NEW.method IS NULL THEN
    SELECT slug INTO NEW.method FROM public.payment_methods WHERE id = NEW.method_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_payment_method_id ON public.payments;
CREATE TRIGGER sync_payment_method_id BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public._sync_payment_method_id_fn();

COMMIT;
