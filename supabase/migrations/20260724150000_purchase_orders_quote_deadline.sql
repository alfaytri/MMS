-- Add purchase_orders.quote_deadline — the date by which invited suppliers
-- must return their quote on an RFQ. Distinct from expected_delivery (which
-- is when we want the goods) and from created_date. Nullable because
-- non-RFQ POs don't use it.

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS quote_deadline date;

COMMENT ON COLUMN public.purchase_orders.quote_deadline IS
  'RFQ response deadline — the date by which invited suppliers must return their quote.';

NOTIFY pgrst, 'reload schema';

COMMIT;
