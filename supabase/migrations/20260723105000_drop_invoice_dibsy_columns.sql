-- Option A: rip Dibsy out of public.invoices. Sales-order invoices are
-- paid via cash / bank transfer / cheque only. Both endpoints that
-- wrote these columns are being deleted in the same task.
--
-- Telelink (tl_invoices) uses its OWN dibsy_* columns and is untouched.
--
-- public.customer_invoices is a passthrough view over public.invoices
-- (see 20260721140000_split_invoices_into_bills.sql) and selects
-- dibsy_payment_id / dibsy_checkout_url explicitly, so it must be
-- dropped and recreated without those columns before the ALTER TABLE
-- can succeed.

BEGIN;

DROP VIEW IF EXISTS public.customer_invoices;

ALTER TABLE public.invoices DROP COLUMN IF EXISTS dibsy_payment_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS dibsy_checkout_url;

CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, notes, qb_synced,
        created_at, updated_at,
        sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid,
        phone_id, division_id
   FROM public.invoices;

COMMIT;
