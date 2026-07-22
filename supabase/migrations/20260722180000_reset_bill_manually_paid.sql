-- Reset manually_paid on all bills so the auto-recompute trigger owns
-- payment_status. The UI "Mark as Paid" button was removed in favor of
-- automatic tracking via bill_recompute_paid_fn; the flag is preserved
-- as a column for future one-off overrides but not set from the UI.
--
-- Also NULL out cached bill PDF URLs so the next view regenerates them
-- with the corrected paid_amount + payment list.

BEGIN;

UPDATE public.bills SET manually_paid = false WHERE manually_paid = true;

-- Force PDF regeneration by clearing cached URLs.
UPDATE public.bills SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

-- Rerun the recompute for every bill now that manually_paid is off, so
-- payment_status matches the real paid_amount instead of the old override.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.bills LOOP
    PERFORM public.bill_recompute_paid_fn(r.id);
  END LOOP;
END $$;

COMMIT;
