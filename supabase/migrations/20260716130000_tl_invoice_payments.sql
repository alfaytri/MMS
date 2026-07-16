-- ============================================================
-- Orders module payment history for tl_invoices.
-- Adds paid_amount + partial status + payments table + trigger.
-- ============================================================

-- 1. Add paid_amount + widen status
ALTER TABLE public.tl_invoices
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.tl_invoices
  DROP CONSTRAINT IF EXISTS tl_invoices_payment_status_check;
ALTER TABLE public.tl_invoices
  ADD CONSTRAINT tl_invoices_payment_status_check
  CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text]));

-- 2. Payments table
CREATE TABLE public.tl_invoice_payments (
    id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tl_invoice_id      uuid NOT NULL REFERENCES public.tl_invoices(id) ON DELETE CASCADE,
    amount             numeric NOT NULL CHECK (amount > 0),
    payment_method_id  uuid REFERENCES public.payment_methods(id),
    method_slug        text,
    paid_at            timestamptz NOT NULL DEFAULT now(),
    registered_by      uuid REFERENCES public.profiles(id),
    registered_by_name text,
    notes              text,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tl_invoice_payments_invoice ON public.tl_invoice_payments(tl_invoice_id);
CREATE INDEX idx_tl_invoice_payments_paid_at ON public.tl_invoice_payments(paid_at DESC);

ALTER TABLE public.tl_invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tl_invoice_payments_read"
  ON public.tl_invoice_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "tl_invoice_payments_write"
  ON public.tl_invoice_payments FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Sync trigger — keeps tl_invoices.paid_amount + payment_status coherent
CREATE OR REPLACE FUNCTION public.sync_tl_invoice_paid_amount() RETURNS trigger AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.tl_invoice_id, OLD.tl_invoice_id);
  v_paid       numeric;
  v_total      numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.tl_invoice_payments
    WHERE tl_invoice_id = v_invoice_id;

  SELECT total_amount INTO v_total
    FROM public.tl_invoices
    WHERE id = v_invoice_id;

  UPDATE public.tl_invoices
     SET paid_amount    = v_paid,
         payment_status = CASE
                            WHEN v_paid <= 0        THEN 'unpaid'
                            WHEN v_paid >= v_total  THEN 'paid'
                            ELSE 'partial'
                          END,
         updated_at     = now()
   WHERE id = v_invoice_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tl_invoice_payments_sync
AFTER INSERT OR UPDATE OR DELETE ON public.tl_invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_tl_invoice_paid_amount();
