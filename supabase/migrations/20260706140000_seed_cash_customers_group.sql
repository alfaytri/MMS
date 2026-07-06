-- Seed baseline payment methods (cash, pos) and the "Cash Customers" credit group.
-- The customer dialog looks up this group by name to bucket cash-type customers.
-- payment_methods is now a junction table (see 20260629110000), so we link the
-- group to the two methods via credit_group_payment_methods.
--
-- Idempotent: safe to re-run.

BEGIN;

INSERT INTO public.payment_methods (name, slug, is_active, sort_order)
VALUES
  ('Cash', 'cash', true, 1),
  ('POS',  'pos',  true, 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.credit_groups (id, name, credit_limit, max_days)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Cash Customers',
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.credit_group_payment_methods (credit_group_id, payment_method_id)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, pm.id
FROM public.payment_methods pm
WHERE pm.slug IN ('cash', 'pos')
ON CONFLICT DO NOTHING;

COMMIT;
