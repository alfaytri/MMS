-- ─────────────────────────────────────────────────────────────────────────────
-- `payments` has both `invoice_id` (legacy direct FK) and `source_type`/
-- `source_id` (polymorphic). Some hooks read the legacy column
-- (useCustomerPayments → query .eq('invoice_id', ...)), others read the
-- polymorphic pair. Mirror them so both stay consistent.
--
-- 1. Update the BEFORE-INSERT redirect trigger to also stamp `invoice_id`
--    when redirecting a sale_order payment to its AR invoice.
-- 2. New BEFORE-INSERT/UPDATE trigger that keeps `invoice_id` ↔
--    `source_id` aligned whenever `source_type='invoice'`.
-- 3. Backfill existing rows so anything pointing at an invoice via the
--    polymorphic pair also has its `invoice_id` populated.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Redirect trigger — now also writes the legacy column
CREATE OR REPLACE FUNCTION public.payments_redirect_to_invoice_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF NEW.source_type <> 'sale_order' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice_id
  FROM   public.invoices
  WHERE  sale_order_id = NEW.source_id AND direction = 'ar'
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
    NEW.invoice_id  := v_invoice_id;        -- keep legacy column aligned
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Sync trigger — fires on every insert / update so the two columns can
--    never drift, no matter which one the caller filled in
CREATE OR REPLACE FUNCTION public.payments_sync_invoice_id_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_type = 'invoice' AND NEW.source_id IS NOT NULL THEN
    NEW.invoice_id := NEW.source_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_sync_invoice_id ON public.payments;
CREATE TRIGGER       trg_payments_sync_invoice_id
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_sync_invoice_id_fn();

-- 3. Backfill
UPDATE public.payments
SET    invoice_id = source_id
WHERE  source_type = 'invoice'
  AND  source_id IS NOT NULL
  AND  (invoice_id IS NULL OR invoice_id <> source_id);

COMMIT;
