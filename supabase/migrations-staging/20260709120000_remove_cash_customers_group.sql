-- Remove the "Cash Customers" credit group.
-- Cash/credit distinction is now driven purely by the customer_type column.
-- No code references this group by name anymore.

BEGIN;

-- 1. Unlink any customers still pointing at the Cash Customers group
UPDATE public.customers
SET credit_group_id = NULL
WHERE credit_group_id = '00000000-0000-0000-0000-000000000001';

-- 2. Remove junction rows
DELETE FROM public.credit_group_payment_methods
WHERE credit_group_id = '00000000-0000-0000-0000-000000000001';

-- 3. Remove the group itself
DELETE FROM public.credit_groups
WHERE id = '00000000-0000-0000-0000-000000000001';

COMMIT;
