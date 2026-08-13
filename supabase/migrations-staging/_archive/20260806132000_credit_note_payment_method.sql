-- rpc_redeem_credit_note inserts payments with method='credit_note' when a CN
-- is applied directly to an invoice (as distinct from method='store_credit'
-- for redemption of a CN that was first resolved as store credit). But
-- 'credit_note' was never a row in payment_methods, so the
-- _sync_payment_method_id_fn trigger raised P0001 'payment method slug
-- credit_note has no matching payment_methods row' on every direct apply.
-- Add the missing slug. Idempotent — ON CONFLICT DO NOTHING lets the
-- migration re-run safely.

BEGIN;

INSERT INTO public.payment_methods (slug, name, is_active)
VALUES ('credit_note', 'Credit Note', true)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
