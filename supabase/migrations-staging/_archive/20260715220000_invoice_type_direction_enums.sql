-- ============================================================
-- Convert invoices.invoice_type (text→enum) and
--          invoices.direction   (text→enum)
--
-- Must drop all dependent objects first:
--   - 2 views (customer_invoices, supplier_bills)
--   - 2 partial indexes (idx_invoices_ar_status, idx_invoices_customer_phone_ar)
--   - 2 CHECK constraints (invoices_invoice_type_check, invoices_direction_check)
--
-- PL/pgSQL functions are NOT dropped — they auto-resolve
-- untyped string literals to the new enum type at call time.
-- ============================================================

BEGIN;

-- ── 0) Drop dependent objects ──────────────────────────────────────────────

DROP VIEW IF EXISTS public.customer_invoices;
DROP VIEW IF EXISTS public.supplier_bills;

DROP INDEX IF EXISTS public.idx_invoices_ar_status;
DROP INDEX IF EXISTS public.idx_invoices_customer_phone_ar;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_direction_check;


-- ── 1) invoice_type text → enum ────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.invoice_type AS ENUM ('cash', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_type DROP DEFAULT;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_type TYPE public.invoice_type
    USING invoice_type::public.invoice_type;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_type SET DEFAULT 'credit'::public.invoice_type;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_type SET NOT NULL;


-- ── 2) direction text → enum ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.invoice_direction AS ENUM ('ar', 'ap');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.invoices
  ALTER COLUMN direction DROP DEFAULT;

ALTER TABLE public.invoices
  ALTER COLUMN direction TYPE public.invoice_direction
    USING direction::public.invoice_direction;

ALTER TABLE public.invoices
  ALTER COLUMN direction SET DEFAULT 'ar'::public.invoice_direction;

ALTER TABLE public.invoices
  ALTER COLUMN direction SET NOT NULL;


-- ── 3) Recreate partial indexes with enum-typed WHERE ──────────────────────

CREATE INDEX idx_invoices_ar_status
  ON public.invoices USING btree (direction, status, payment_status)
  WHERE (direction = 'ar'::public.invoice_direction);

CREATE INDEX idx_invoices_customer_phone_ar
  ON public.invoices USING btree (customer_id, phone_id)
  WHERE (direction = 'ar'::public.invoice_direction);


-- ── 4) Recreate views with security_invoker ────────────────────────────────

CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, division, notes, qb_synced,
        created_at, updated_at, direction, supplier_id,
        purchase_order_id, receival_id, sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid
   FROM public.invoices
  WHERE direction = 'ar'::public.invoice_direction;

CREATE VIEW public.supplier_bills WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, division, notes, qb_synced,
        created_at, updated_at, direction, supplier_id,
        purchase_order_id, receival_id, sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid
   FROM public.invoices
  WHERE direction = 'ap'::public.invoice_direction;

COMMIT;
