-- Cash & Cash Equivalents source-of-truth: an operator-managed flag on each
-- payment method marking whether payments made with it count as "cash".
--
-- The Cash report (2.4 / accounting reports) must count only genuine cash-like
-- methods, and the operator wants to decide that per method (Cash, POS, a petty-
-- cash method they create later, …) rather than hard-coding the name "Cash".
-- Mirrors the existing per-method boolean pattern (requires_payment_link).
-- Seed: the built-in "Cash" method starts flagged on; everything else off.

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS is_cash_equivalent boolean NOT NULL DEFAULT false;

UPDATE public.payment_methods
   SET is_cash_equivalent = true
 WHERE slug = 'cash'
   AND is_cash_equivalent IS DISTINCT FROM true;

COMMENT ON COLUMN public.payment_methods.is_cash_equivalent IS
  'When true, payments using this method count toward the Cash & Cash Equivalents report. Operator-managed in Master Data → Admin → Payment Methods.';
