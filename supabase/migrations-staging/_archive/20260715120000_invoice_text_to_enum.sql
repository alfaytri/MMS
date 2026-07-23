-- ============================================================
-- Convert invoice text columns to enums
-- ============================================================

BEGIN;

-- 1) Create enums
CREATE TYPE public.invoice_doc_status AS ENUM (
  'draft',
  'ready_to_send',
  'sent',
  'pending_approval',
  'approved',
  'rejected'
);

CREATE TYPE public.invoice_payment_status AS ENUM (
  'unpaid',
  'partially_paid',
  'paid',
  'overdue'
);

-- 2) Drop all dependents
DROP VIEW IF EXISTS public.customer_invoices;
DROP VIEW IF EXISTS public.supplier_bills;
DROP INDEX IF EXISTS public.idx_invoices_ar_status;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_doc_status_check;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

-- 3) Convert doc_status: text → enum
ALTER TABLE public.invoices
  ALTER COLUMN doc_status DROP DEFAULT;
ALTER TABLE public.invoices
  ALTER COLUMN doc_status TYPE public.invoice_doc_status
    USING doc_status::public.invoice_doc_status;
ALTER TABLE public.invoices
  ALTER COLUMN doc_status SET DEFAULT 'draft'::public.invoice_doc_status;

-- 4) Convert payment_status: text → enum
ALTER TABLE public.invoices
  ALTER COLUMN payment_status DROP DEFAULT;
ALTER TABLE public.invoices
  ALTER COLUMN payment_status TYPE public.invoice_payment_status
    USING payment_status::public.invoice_payment_status;
ALTER TABLE public.invoices
  ALTER COLUMN payment_status SET DEFAULT 'unpaid'::public.invoice_payment_status;

-- 5) Recreate index
CREATE INDEX idx_invoices_ar_status
  ON public.invoices USING btree (direction, status, payment_status)
  WHERE (direction = 'ar');

-- 6) Recreate views
CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, division, notes, qb_synced,
        created_at, updated_at, direction, supplier_id,
        purchase_order_id, receival_id, sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid
   FROM public.invoices
  WHERE direction = 'ar';

CREATE VIEW public.supplier_bills WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, division, notes, qb_synced,
        created_at, updated_at, direction, supplier_id,
        purchase_order_id, receival_id, sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid
   FROM public.invoices
  WHERE direction = 'ap';

COMMIT;
