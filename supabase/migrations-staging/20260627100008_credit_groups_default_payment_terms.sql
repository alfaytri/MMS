-- Add default_payment_terms to credit_groups so the SO create page can
-- pre-select a payment-terms preset based on the chosen customer's credit
-- group. Cash customers still bypass payment terms entirely; this is
-- credit-group-scoped only.
--
-- Allowed values match the PAYMENT_PRESETS list in SoTermsSection.tsx —
-- '100% Advance', '100% After Delivery', '50/50', 'Net 30', 'Net 60',
-- 'Custom'. NULL means no default; UI falls back to whatever the user
-- last set (or none).
BEGIN;

ALTER TABLE public.credit_groups
  ADD COLUMN IF NOT EXISTS default_payment_terms TEXT;

ALTER TABLE public.credit_groups
  DROP CONSTRAINT IF EXISTS credit_groups_default_payment_terms_chk;
ALTER TABLE public.credit_groups
  ADD CONSTRAINT credit_groups_default_payment_terms_chk
  CHECK (
    default_payment_terms IS NULL
    OR default_payment_terms IN (
      '100% Advance', '100% After Delivery', '50/50',
      'Net 30', 'Net 60', 'Custom'
    )
  );

COMMIT;
