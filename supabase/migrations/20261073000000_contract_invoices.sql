-- Contract Invoices — Phase 1 (schema + auto-generation + schedule reconciliation).
--
-- Full contract invoices at parity with the order-invoice (tl_invoices) stack:
-- each contract_payments schedule row gets ONE contract_invoice (1:1), total =
-- the installment, itemized by allocating the installment across the contract's
-- services (weighted by each service's term-total; last line absorbs rounding so
-- lines always sum to the installment).
--
-- Money authority is server-side and mirrors tl_invoices:
--   * generate_contract_invoices(contract)  — idempotent generator, permission
--     gated, called at the end of rpc_activate_contract (auto per schedule).
--   * contract_invoice_payments + sync trigger derive paid_amount/payment_status.
--   * rpc_record_contract_invoice_payment  — record a collection (overpay-guarded).
--   * Reconciliation keeps the invoice and its schedule row in ONE state:
--       invoice → paid   ⇒ contract_payments.status = 'paid'  (+ contracts.paid_amount)
--       schedule → paid  ⇒ invoice auto-fully-paid (legacy rpc_record_contract_payment)
--     Both directions are guarded against trigger recursion.
--
-- RLS: enabled on all three tables (SELECT to authenticated; NO anon); every
-- write path is a SECURITY DEFINER RPC (which bypasses RLS as owner). This is
-- stricter than the tl_invoices precedent (which ships RLS-disabled + anon CRUD).
BEGIN;

-- ── 1. Sequence + tables ─────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.contract_invoice_seq;

CREATE TABLE IF NOT EXISTS public.contract_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      text NOT NULL,
  contract_id         uuid NOT NULL REFERENCES public.contracts(id)         ON DELETE CASCADE,
  contract_payment_id uuid NOT NULL REFERENCES public.contract_payments(id) ON DELETE CASCADE,
  customer_name       text NOT NULL DEFAULT '',
  customer_phone      text,
  due_date            date,
  subtotal            numeric NOT NULL DEFAULT 0,
  discount_amount     numeric NOT NULL DEFAULT 0,
  total_amount        numeric NOT NULL DEFAULT 0,
  paid_amount         numeric NOT NULL DEFAULT 0,
  payment_status      text    NOT NULL DEFAULT 'unpaid',
  dibsy_payment_id    text,
  dibsy_checkout_url  text,
  pdf_url             text,
  sent_at             timestamptz,          -- Phase 2: set when the WhatsApp fires
  notes               text,
  created_by          uuid,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT contract_invoices_invoice_number_unique UNIQUE (invoice_number),
  CONSTRAINT contract_invoices_payment_unique        UNIQUE (contract_payment_id),
  CONSTRAINT contract_invoices_payment_status_check
    CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text]))
);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract ON public.contract_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_due      ON public.contract_invoices(due_date);

CREATE TABLE IF NOT EXISTS public.contract_invoice_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_invoice_id uuid NOT NULL REFERENCES public.contract_invoices(id) ON DELETE CASCADE,
  name                text NOT NULL,
  qty                 numeric NOT NULL DEFAULT 1,
  unit_price          numeric NOT NULL DEFAULT 0,
  total               numeric NOT NULL DEFAULT 0,
  sort_order          int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contract_invoice_lines_inv ON public.contract_invoice_lines(contract_invoice_id);

CREATE TABLE IF NOT EXISTS public.contract_invoice_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_invoice_id uuid NOT NULL REFERENCES public.contract_invoices(id) ON DELETE CASCADE,
  amount              numeric NOT NULL CHECK (amount > 0),
  payment_method_id   uuid REFERENCES public.payment_methods(id),
  method_slug         text,
  paid_at             timestamptz NOT NULL DEFAULT now(),
  registered_by       uuid,
  registered_by_name  text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_invoice_payments_inv ON public.contract_invoice_payments(contract_invoice_id);

-- ── 2. Invoice numbering (BEFORE INSERT), mirrors generate_tl_invoice_number ──
CREATE OR REPLACE FUNCTION public.generate_contract_invoice_number()
 RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'CINV/' ||
      EXTRACT(YEAR FROM now())::text || '/' ||
      LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '/' ||
      LPAD(nextval('contract_invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_contract_invoice_number ON public.contract_invoices;
CREATE TRIGGER trg_contract_invoice_number
  BEFORE INSERT ON public.contract_invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_contract_invoice_number();

DROP TRIGGER IF EXISTS trg_contract_invoices_updated_at ON public.contract_invoices;
CREATE TRIGGER trg_contract_invoices_updated_at
  BEFORE UPDATE ON public.contract_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. paid_amount / payment_status sync (mirrors sync_tl_invoice_paid_amount) ─
CREATE OR REPLACE FUNCTION public.sync_contract_invoice_paid_amount()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  v_inv   uuid := COALESCE(NEW.contract_invoice_id, OLD.contract_invoice_id);
  v_paid  numeric;
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.contract_invoice_payments WHERE contract_invoice_id = v_inv;
  SELECT total_amount INTO v_total
    FROM public.contract_invoices WHERE id = v_inv;
  UPDATE public.contract_invoices
     SET paid_amount    = v_paid,
         payment_status = CASE
                            WHEN v_paid <= 0       THEN 'unpaid'
                            WHEN v_paid >= v_total THEN 'paid'
                            ELSE 'partial'
                          END,
         updated_at     = now()
   WHERE id = v_inv;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_contract_invoice_payments_sync ON public.contract_invoice_payments;
CREATE TRIGGER trg_contract_invoice_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_contract_invoice_paid_amount();

-- ── 4. Reconcile: invoice status → schedule row + contracts.paid_amount ──────
CREATE OR REPLACE FUNCTION public.reconcile_contract_payment_from_invoice()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_contract uuid;
BEGIN
  IF NEW.payment_status = 'paid' THEN
    UPDATE public.contract_payments SET status = 'paid'
      WHERE id = NEW.contract_payment_id AND status IS DISTINCT FROM 'paid';
  ELSE
    -- invoice fell back to unpaid/partial (e.g. a payment was deleted) → un-collect
    UPDATE public.contract_payments SET status = 'pending'
      WHERE id = NEW.contract_payment_id AND status = 'paid';
  END IF;

  SELECT contract_id INTO v_contract FROM public.contract_payments WHERE id = NEW.contract_payment_id;
  UPDATE public.contracts c
     SET paid_amount = COALESCE((
           SELECT SUM(amount) FROM public.contract_payments
           WHERE contract_id = v_contract AND status = 'paid'), 0)
   WHERE c.id = v_contract;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_contract_invoice_reconcile ON public.contract_invoices;
CREATE TRIGGER trg_contract_invoice_reconcile
  AFTER UPDATE OF payment_status ON public.contract_invoices
  FOR EACH ROW WHEN (NEW.payment_status IS DISTINCT FROM OLD.payment_status)
  EXECUTE FUNCTION public.reconcile_contract_payment_from_invoice();

-- ── 5. Reverse: schedule row marked paid (legacy path) → auto-fully-pay invoice ─
--     Guard `paid_amount < total_amount` stops the reconcile→reverse→reconcile loop.
CREATE OR REPLACE FUNCTION public.sync_contract_invoice_from_payment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_inv record;
BEGIN
  SELECT id, total_amount, paid_amount INTO v_inv
    FROM public.contract_invoices WHERE contract_payment_id = NEW.id;
  IF FOUND AND v_inv.paid_amount < v_inv.total_amount THEN
    INSERT INTO public.contract_invoice_payments (contract_invoice_id, amount, method_slug, notes)
    VALUES (v_inv.id, v_inv.total_amount - v_inv.paid_amount, 'manual', 'Auto: schedule marked paid');
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_contract_payment_mark_invoice ON public.contract_payments;
CREATE TRIGGER trg_contract_payment_mark_invoice
  AFTER UPDATE OF status ON public.contract_payments
  FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.sync_contract_invoice_from_payment();

-- ── 6. Period-count helper (mirrors contractUtils.paymentPeriodCount exactly) ──
CREATE OR REPLACE FUNCTION public.contract_period_count(p_start date, p_end date, p_freq text)
 RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_n int := 0; v_cur date := p_start; v_step interval;
BEGIN
  v_step := CASE p_freq
    WHEN 'daily'       THEN interval '1 day'
    WHEN 'weekly'      THEN interval '1 week'
    WHEN 'bi_weekly'   THEN interval '2 weeks'
    WHEN 'monthly'     THEN interval '1 month'
    WHEN 'quarterly'   THEN interval '3 months'
    WHEN 'semi_annual' THEN interval '6 months'
    WHEN 'annual'      THEN interval '1 year'
    ELSE NULL END;
  IF v_step IS NULL THEN RETURN 1; END IF;
  WHILE v_cur < p_end LOOP
    v_n := v_n + 1;
    v_cur := (v_cur + v_step)::date;
  END LOOP;
  RETURN GREATEST(v_n, 1);
END $fn$;

-- ── 7. Idempotent generator: one invoice per schedule row lacking one ─────────
CREATE OR REPLACE FUNCTION public.generate_contract_invoices(p_contract_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  v_contract     record;
  v_pay          record;
  v_svc          record;
  v_total_weight numeric := 0;
  v_n_services   int     := 0;
  v_created      int     := 0;
  v_inv_id       uuid;
  v_alloc        numeric;
  v_running      numeric;
  v_idx          int;
BEGIN
  IF NOT (public._auth_user_has_permission('contracts.activate')
       OR public._auth_user_has_permission('contracts.live.manage')) THEN
    RAISE EXCEPTION 'Not authorized to generate contract invoices' USING ERRCODE = '42501';
  END IF;

  SELECT id, customer_name, phone, start_date, end_date INTO v_contract
    FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found'; END IF;

  SELECT COALESCE(SUM(cs.total_price *
           public.contract_period_count(v_contract.start_date, v_contract.end_date, cs.frequency)), 0),
         COUNT(*)
    INTO v_total_weight, v_n_services
    FROM public.contract_services cs
    WHERE cs.contract_id = p_contract_id AND cs.item_kind IS DISTINCT FROM 'product';

  FOR v_pay IN
    SELECT cp.* FROM public.contract_payments cp
    WHERE cp.contract_id = p_contract_id
      AND NOT EXISTS (SELECT 1 FROM public.contract_invoices ci WHERE ci.contract_payment_id = cp.id)
    ORDER BY cp.due_date
  LOOP
    INSERT INTO public.contract_invoices
      (contract_id, contract_payment_id, customer_name, customer_phone, due_date,
       subtotal, discount_amount, total_amount)
    VALUES
      (p_contract_id, v_pay.id, COALESCE(v_contract.customer_name, ''), v_contract.phone, v_pay.due_date,
       v_pay.amount, 0, v_pay.amount)
    RETURNING id INTO v_inv_id;

    IF v_total_weight > 0 AND v_n_services > 0 THEN
      v_running := 0; v_idx := 0;
      FOR v_svc IN
        SELECT cs.service_name,
               cs.total_price *
                 public.contract_period_count(v_contract.start_date, v_contract.end_date, cs.frequency) AS weight
        FROM public.contract_services cs
        WHERE cs.contract_id = p_contract_id AND cs.item_kind IS DISTINCT FROM 'product'
        ORDER BY cs.sort_order, cs.service_name
      LOOP
        v_idx := v_idx + 1;
        IF v_idx = v_n_services THEN
          v_alloc := v_pay.amount - v_running;                    -- last line absorbs rounding
        ELSE
          v_alloc := round(v_pay.amount * v_svc.weight / v_total_weight, 2);
          v_running := v_running + v_alloc;
        END IF;
        INSERT INTO public.contract_invoice_lines (contract_invoice_id, name, qty, unit_price, total, sort_order)
        VALUES (v_inv_id, v_svc.service_name, 1, v_alloc, v_alloc, v_idx);
      END LOOP;
    ELSE
      INSERT INTO public.contract_invoice_lines (contract_invoice_id, name, qty, unit_price, total, sort_order)
      VALUES (v_inv_id, 'Contract installment', 1, v_pay.amount, v_pay.amount, 1);
    END IF;

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END $fn$;

-- ── 8. Record a collection against a contract invoice (overpay-guarded) ──────
CREATE OR REPLACE FUNCTION public.rpc_record_contract_invoice_payment(
  p_invoice_id  uuid,
  p_amount      numeric,
  p_method_slug text DEFAULT NULL,
  p_notes       text DEFAULT NULL,
  p_user_id     uuid DEFAULT NULL,
  p_user_name   text DEFAULT NULL
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  v_total     numeric;
  v_paid      numeric;
  v_remaining numeric;
  v_method    uuid;
BEGIN
  IF NOT public._auth_user_has_permission('contracts.live.manage') THEN
    RAISE EXCEPTION 'Not authorized to record contract payments' USING ERRCODE = '42501';
  END IF;

  SELECT total_amount, paid_amount INTO v_total, v_paid
    FROM public.contract_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0'; END IF;
  v_remaining := v_total - v_paid;
  IF p_amount - v_remaining > 0.005 THEN
    RAISE EXCEPTION 'amount_exceeds_balance' USING DETAIL = 'remaining=' || v_remaining;
  END IF;

  SELECT id INTO v_method FROM public.payment_methods WHERE slug = p_method_slug LIMIT 1;

  INSERT INTO public.contract_invoice_payments
    (contract_invoice_id, amount, payment_method_id, method_slug, registered_by, registered_by_name, notes)
  VALUES
    (p_invoice_id, p_amount, v_method, p_method_slug, p_user_id, p_user_name, p_notes);
END $fn$;

-- ── 9. Auto-generate on activation: extend rpc_activate_contract ─────────────
--     (verbatim live body + a single PERFORM at the end; single overload.)
CREATE OR REPLACE FUNCTION public.rpc_activate_contract(
  p_contract_id uuid,
  p_payments    jsonb,
  p_user_id     uuid,
  p_user_name   text
)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  v_status   text;
  v_existing text;
  v_terms    jsonb;
  v_new_id   text;
  v_total    numeric;
BEGIN
  IF NOT public._auth_user_has_permission('contracts.activate')
     AND NOT public._auth_user_has_permission('contracts.live.manage') THEN
    RAISE EXCEPTION 'Not authorized to activate contracts' USING ERRCODE = '42501';
  END IF;

  SELECT status, contract_id, terms_snapshot INTO v_status, v_existing, v_terms
  FROM public.contracts WHERE id = p_contract_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found'; END IF;
  IF v_status = 'active' THEN RETURN v_existing; END IF;      -- idempotent
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'contract_not_approved' USING DETAIL = 'status=' || v_status;
  END IF;

  v_new_id := public.generate_contract_id();

  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' THEN
    INSERT INTO public.contract_payments (contract_id, due_date, amount, status)
    SELECT p_contract_id, (elem->>'due_date')::date,
           (elem->>'amount')::numeric, COALESCE(elem->>'status', 'pending')
    FROM jsonb_array_elements(p_payments) elem;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.contract_payments WHERE contract_id = p_contract_id;

  UPDATE public.contracts
  SET contract_id    = v_new_id,
      status         = 'active',
      has_signed_doc = true,
      terms_snapshot = COALESCE(v_terms, jsonb_build_object('captured_at', now())),
      total_payments = v_total,
      paid_amount    = 0
  WHERE id = p_contract_id;

  -- Full contract invoices: one per schedule row (idempotent).
  PERFORM public.generate_contract_invoices(p_contract_id);

  RETURN v_new_id;
END $fn$;

-- ── 10. RLS (stricter than tl_invoices) + grants for Data-API reachability ───
ALTER TABLE public.contract_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_invoice_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_invoices_select         ON public.contract_invoices;
DROP POLICY IF EXISTS contract_invoice_lines_select    ON public.contract_invoice_lines;
DROP POLICY IF EXISTS contract_invoice_payments_select ON public.contract_invoice_payments;

CREATE POLICY contract_invoices_select         ON public.contract_invoices         FOR SELECT TO authenticated USING (true);
CREATE POLICY contract_invoice_lines_select    ON public.contract_invoice_lines    FOR SELECT TO authenticated USING (true);
CREATE POLICY contract_invoice_payments_select ON public.contract_invoice_payments FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.contract_invoices, public.contract_invoice_lines, public.contract_invoice_payments TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_contract_invoices(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_contract_invoice_payment(uuid, numeric, text, text, uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
