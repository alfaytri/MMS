-- Task 3 (SO/Invoice Parity) — reset so_invoices.manually_paid so the
-- trigger owns payment_status. The manual "Mark as Paid" toggle (if
-- any) is removed in the accompanying code change; the column stays
-- for one-off future overrides but is no longer written from the UI
-- or from any live code path (the Dibsy webhook branches that used to
-- set it were deleted in Task 2).
--
-- Also clears cached invoice PDFs so any invoice whose displayed
-- status changes as a result of the reset re-renders correctly.

BEGIN;

UPDATE public.so_invoices SET manually_paid = false WHERE manually_paid = true;

UPDATE public.so_invoices SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.so_invoices LOOP
    PERFORM public.recalculate_ar_invoice_payment_status(r.id);
  END LOOP;
END $$;

COMMIT;
