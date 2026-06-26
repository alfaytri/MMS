-- supabase/migrations/20260627090000_cleanup_credit_customers_in_cash_group.sql
-- One-time cleanup: any customer with customer_type = 'credit' but assigned to
-- the "Cash Customers" credit group is in an inconsistent state. The Cash
-- Customers group is reserved for cash-type customers. Flip these rows to
-- customer_type = 'cash' so the dataset matches the rule the app now enforces.
BEGIN;

UPDATE public.customers
SET    customer_type = 'cash',
       updated_at    = now()
WHERE  customer_type = 'credit'
  AND  credit_group_id IN (
    SELECT id FROM public.credit_groups WHERE name = 'Cash Customers'
  );

COMMIT;
