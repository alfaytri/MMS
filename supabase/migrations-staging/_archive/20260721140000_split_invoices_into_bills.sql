-- ============================================================
-- Invoice / Bill Table Split
--
-- Splits the single `invoices` table into:
--   • `invoices` (AR — Accounts Receivable, customer invoices)
--   • `bills`    (AP — Accounts Payable, supplier bills)
--
-- Also splits `credit_notes` into:
--   • `credit_notes` (AR — customer credit notes)
--   • `debit_notes`  (AP — supplier debit notes)
--
-- Single atomic transaction — rolls back on any error.
-- UUIDs are preserved so all FK references stay valid.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Drop dependent views & indexes (they reference `direction`)
-- ============================================================

DROP VIEW IF EXISTS public.customer_invoices CASCADE;
DROP VIEW IF EXISTS public.supplier_bills CASCADE;
DROP INDEX IF EXISTS public.idx_invoices_ar_status;
DROP INDEX IF EXISTS public.idx_invoices_customer_phone_ar;

-- ============================================================
-- 1. Create `bill_source` enum
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.bill_source AS ENUM ('order');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Create `bills` table (AP)
-- ============================================================

CREATE TABLE public.bills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number         text NOT NULL,
  bill_type           public.invoice_type NOT NULL DEFAULT 'credit',
  source              public.bill_source NOT NULL DEFAULT 'order',
  source_id           text NOT NULL,
  source_label        text,
  status              text,
  doc_status          text NOT NULL DEFAULT 'draft',
  payment_status      text NOT NULL DEFAULT 'unpaid',
  supplier_id         uuid REFERENCES public.suppliers(id),
  purchase_order_id   uuid REFERENCES public.purchase_orders(id),
  receival_id         uuid REFERENCES public.receivals(id),
  division_id         uuid REFERENCES public.company_divisions(id),
  issued_date         date NOT NULL DEFAULT CURRENT_DATE,
  due_date            date NOT NULL DEFAULT CURRENT_DATE,
  subtotal            numeric,
  tax                 numeric,
  discount_amount     numeric NOT NULL DEFAULT 0,
  discount_label      text,
  total_amount        numeric,
  paid_amount         numeric,
  manually_paid       boolean NOT NULL DEFAULT false,
  needs_refresh       boolean NOT NULL DEFAULT false,
  notes               text,
  pdf_url             text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT bills_doc_status_check CHECK (doc_status IN ('draft','ready_to_send','sent','pending_approval','approved','rejected')),
  CONSTRAINT bills_payment_status_check CHECK (payment_status IN ('unpaid','partially_paid','paid','overdue'))
);

CREATE INDEX idx_bills_supplier_id ON public.bills(supplier_id);
CREATE INDEX idx_bills_purchase_order_id ON public.bills(purchase_order_id);
CREATE INDEX idx_bills_division_id ON public.bills(division_id);
CREATE INDEX idx_bills_payment_status ON public.bills(payment_status) WHERE payment_status != 'paid';

-- ============================================================
-- 3. Create `bill_line_items` table
-- ============================================================

CREATE TABLE public.bill_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  description   text NOT NULL,
  qty           integer DEFAULT 1,
  unit_price    numeric DEFAULT 0,
  total         numeric DEFAULT 0,
  team_name     text,
  match_status  text,
  match_note    text,
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT bill_line_items_match_status_check CHECK (
    match_status IN ('matched','qty_discrepancy','price_discrepancy','unmatched','accepted_with_note')
  )
);

CREATE INDEX idx_bill_line_items_bill_id ON public.bill_line_items(bill_id);

-- ============================================================
-- 4. Create `debit_notes` table (AP)
-- ============================================================

CREATE TABLE public.debit_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id       text NOT NULL,
  bill_id             uuid REFERENCES public.bills(id),
  purchase_order_id   uuid REFERENCES public.purchase_orders(id),
  supplier_name       text,
  reason              text NOT NULL,
  type                text NOT NULL DEFAULT 'manual',
  status              public.credit_note_status DEFAULT 'draft',
  total_amount        numeric NOT NULL DEFAULT 0,
  original_total      numeric,
  new_total           numeric,
  source_return_id    uuid REFERENCES public.returns(id),
  resolution_type     text,
  notes               text,
  pdf_url             text,
  phone               text,
  approved_by         uuid REFERENCES public.profiles(id),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT debit_notes_resolution_type_check CHECK (
    resolution_type IN ('supplier_credit','replacement')
  )
);

CREATE INDEX idx_debit_notes_bill_id ON public.debit_notes(bill_id);
CREATE INDEX idx_debit_notes_po_id ON public.debit_notes(purchase_order_id);

-- ============================================================
-- 5. Create `debit_note_lines` table
-- ============================================================

CREATE TABLE public.debit_note_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id       uuid NOT NULL REFERENCES public.debit_notes(id) ON DELETE CASCADE,
  bill_line_id        uuid,  -- FK added after bill_line_items migration
  description         text,
  sku                 text,
  qty                 numeric NOT NULL,
  unit_price          numeric NOT NULL,
  total               numeric GENERATED ALWAYS AS (qty * unit_price) STORED,
  line_type           text NOT NULL DEFAULT 'returned',
  condition           text,
  condition_notes     text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_debit_note_lines_note_id ON public.debit_note_lines(debit_note_id);

-- ============================================================
-- 6. Migrate AP invoice data → `bills` (preserve UUIDs)
-- ============================================================

INSERT INTO public.bills (
  id, bill_number, bill_type, source, source_id, source_label,
  status, doc_status, payment_status,
  supplier_id, purchase_order_id, receival_id, division_id,
  issued_date, due_date, subtotal, tax,
  discount_amount, discount_label, total_amount, paid_amount,
  manually_paid, needs_refresh, notes, pdf_url,
  created_at, updated_at
)
SELECT
  i.id,
  i.invoice_id,           -- existing bill number preserved
  i.invoice_type,
  'order'::public.bill_source,
  COALESCE(i.source_id, ''),
  i.source_label,
  i.status,
  i.doc_status::text,
  i.payment_status::text,
  i.supplier_id,
  i.purchase_order_id,
  i.receival_id,
  i.division_id,
  i.issued_date,
  i.due_date,
  i.subtotal,
  i.tax,
  i.discount_amount,
  i.discount_label,
  i.total_amount,
  i.paid_amount,
  i.manually_paid,
  i.needs_refresh,
  i.notes,
  i.pdf_url,
  i.created_at,
  i.updated_at
FROM public.invoices i
WHERE i.direction = 'ap'::public.invoice_direction;

-- ============================================================
-- 7. Migrate AP line items → `bill_line_items`
-- ============================================================

INSERT INTO public.bill_line_items (
  id, bill_id, description, qty, unit_price, total, team_name,
  match_status, match_note, created_at
)
SELECT
  ili.id,
  ili.invoice_id,   -- same UUID, now points to bills
  ili.description,
  ili.qty,
  ili.unit_price,
  ili.total,
  ili.team_name,
  ili.match_status,
  ili.match_note,
  ili.created_at
FROM public.invoice_line_items ili
JOIN public.invoices i ON i.id = ili.invoice_id
WHERE i.direction = 'ap'::public.invoice_direction;

-- ============================================================
-- 8. Migrate AP debit notes → `debit_notes`
-- ============================================================

INSERT INTO public.debit_notes (
  id, debit_note_id, bill_id, purchase_order_id, supplier_name,
  reason, type, status, total_amount, original_total, new_total,
  source_return_id, resolution_type, notes, pdf_url, phone,
  approved_by, created_by, created_at, updated_at
)
SELECT
  cn.id,
  cn.credit_note_id,
  cn.invoice_id,         -- was AP invoice_id → now bill_id (same UUID)
  cn.purchase_order_id,
  cn.supplier_name,
  cn.reason,
  cn.type,
  cn.status,
  cn.total_amount,
  cn.original_total,
  cn.new_total,
  cn.source_return_id,
  cn.resolution_type,
  cn.notes,
  cn.pdf_url,
  cn.phone,
  cn.approved_by::uuid,
  cn.created_by,
  cn.created_at,
  cn.updated_at
FROM public.credit_notes cn
WHERE cn.note_type = 'debit';

-- ============================================================
-- 9. Migrate debit note lines → `debit_note_lines`
-- ============================================================

INSERT INTO public.debit_note_lines (
  id, debit_note_id, bill_line_id, description, sku,
  qty, unit_price, line_type, condition, condition_notes, created_at
)
SELECT
  cl.id,
  cl.credit_note_id,    -- now debit_note_id (same UUID)
  cl.invoice_line_id,   -- now bill_line_id (same UUID)
  cl.description,
  cl.sku,
  cl.qty,
  cl.unit_price,
  cl.line_type,
  cl.condition,
  cl.condition_notes,
  cl.created_at
FROM public.credit_note_lines cl
JOIN public.credit_notes cn ON cn.id = cl.credit_note_id
WHERE cn.note_type = 'debit';

-- Now add the FK on debit_note_lines.bill_line_id
ALTER TABLE public.debit_note_lines
  ADD CONSTRAINT debit_note_lines_bill_line_id_fkey
  FOREIGN KEY (bill_line_id) REFERENCES public.bill_line_items(id);

-- ============================================================
-- 10. Add `bill_id` FK to `payments` and `payment_plans`
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id);

ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id) ON DELETE CASCADE;

-- Make payment_plans.invoice_id nullable (was NOT NULL, now can be NULL for AP plans)
ALTER TABLE public.payment_plans
  ALTER COLUMN invoice_id DROP NOT NULL;

-- ============================================================
-- 11. Populate `bill_id` on payments / payment_plans
-- ============================================================

-- Payments: outgoing payments whose invoice_id pointed to an AP invoice
UPDATE public.payments p
SET    bill_id    = p.invoice_id,
       invoice_id = NULL
FROM   public.bills b
WHERE  b.id = p.invoice_id;

-- Payment plans linked to AP invoices
UPDATE public.payment_plans pp
SET    bill_id    = pp.invoice_id,
       invoice_id = NULL
FROM   public.bills b
WHERE  b.id = pp.invoice_id;

-- ============================================================
-- 12. Re-point `payment_bill_allocations` FK: invoices → bills
-- ============================================================

ALTER TABLE public.payment_bill_allocations
  DROP CONSTRAINT IF EXISTS payment_bill_allocations_bill_id_fkey;

ALTER TABLE public.payment_bill_allocations
  ADD CONSTRAINT payment_bill_allocations_bill_id_fkey
  FOREIGN KEY (bill_id) REFERENCES public.bills(id) ON DELETE CASCADE;

-- ============================================================
-- 13–16. Delete migrated AP data from old tables
-- ============================================================

-- 13. Delete migrated AP debit note lines
DELETE FROM public.credit_note_lines cl
USING  public.credit_notes cn
WHERE  cl.credit_note_id = cn.id
  AND  cn.note_type = 'debit';

-- 14. Delete migrated AP debit notes
DELETE FROM public.credit_notes
WHERE note_type = 'debit';

-- 15. Delete migrated AP line items
DELETE FROM public.invoice_line_items ili
USING  public.invoices i
WHERE  ili.invoice_id = i.id
  AND  i.direction = 'ap'::public.invoice_direction;

-- 16. Delete migrated AP rows from invoices
DELETE FROM public.invoices
WHERE direction = 'ap'::public.invoice_direction;

-- ============================================================
-- 17. Clean up `credit_notes` — drop AP-only columns
-- ============================================================

ALTER TABLE public.credit_notes
  DROP COLUMN IF EXISTS supplier_name,
  DROP COLUMN IF EXISTS purchase_order_id,
  DROP COLUMN IF EXISTS note_type;

-- ============================================================
-- 18. Clean up `invoices` — drop AP-only columns + dead columns
-- ============================================================

-- Drop FKs first
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_supplier_id_fkey;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_purchase_order_id_fkey;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_receival_id_fkey;

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS direction,
  DROP COLUMN IF EXISTS supplier_id,
  DROP COLUMN IF EXISTS purchase_order_id,
  DROP COLUMN IF EXISTS receival_id,
  DROP COLUMN IF EXISTS division;  -- dead text column, replaced by division_id

-- ============================================================
-- 19. Clean up `invoice_line_items` — drop AP-only columns
-- ============================================================

ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS invoice_line_items_match_status_check;

ALTER TABLE public.invoice_line_items
  DROP COLUMN IF EXISTS match_status,
  DROP COLUMN IF EXISTS match_note;

-- ============================================================
-- 20. RLS + policies on new tables
-- ============================================================

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_note_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage bills"
  ON public.bills TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage bill_line_items"
  ON public.bill_line_items TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage debit_notes"
  ON public.debit_notes TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage debit_note_lines"
  ON public.debit_note_lines TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 21. Recreate views
-- ============================================================

-- customer_invoices: now just a passthrough (no direction filter)
CREATE VIEW public.customer_invoices WITH (security_invoker='true') AS
 SELECT id, invoice_id, customer_id, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, agent_name, notes, qb_synced,
        created_at, updated_at,
        sale_order_id, sale_delivery_id,
        needs_refresh, doc_status, payment_status, invoice_type,
        discount_amount, discount_label, manually_paid,
        dibsy_payment_id, dibsy_checkout_url, phone_id, division_id
   FROM public.invoices;

-- supplier_bills: now reads from bills table
CREATE VIEW public.supplier_bills WITH (security_invoker='true') AS
 SELECT id, bill_number, bill_type, source, source_id, source_label,
        issued_date, due_date, status, subtotal, tax, total_amount,
        paid_amount, notes,
        created_at, updated_at,
        supplier_id, purchase_order_id, receival_id,
        needs_refresh, doc_status, payment_status,
        discount_amount, discount_label, manually_paid,
        division_id, pdf_url
   FROM public.bills;

-- ============================================================
-- 22. Rewrite RPCs
-- ============================================================

-- 22a. generate_invoice_from_so — remove direction references
CREATE OR REPLACE FUNCTION public.generate_invoice_from_so(p_so_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_so               RECORD;
  v_invoice_id_str   TEXT;
  v_invoice_type     TEXT;
  v_issued_date      DATE;
  v_due_date         DATE;
  v_inv_count        INT;
  v_new_inv_id       uuid;
  v_new_inv_str      TEXT;
  v_paid_amount      NUMERIC;
  v_payment_status   TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoices_serial'));

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE  sale_order_id = p_so_id
  ) THEN
    RAISE EXCEPTION 'invoice_exists';
  END IF;

  SELECT
    so.id, so.so_number, so.status, so.customer_id,
    so.division_id,
    so.subtotal,
    COALESCE(so.tax, 0)                 AS tax,
    so.total                            AS total_amount,
    COALESCE(c.customer_type, 'credit') AS customer_type
  INTO v_so
  FROM sale_orders so
  JOIN customers   c  ON c.id = so.customer_id
  WHERE so.id = p_so_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'so_not_found';
  END IF;

  IF v_so.status NOT IN ('confirmed', 'partial_delivery', 'delivered') THEN
    RAISE EXCEPTION 'so_not_invoiceable';
  END IF;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
    INTO v_paid_amount
  FROM   public.payments
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  v_payment_status := CASE
    WHEN v_paid_amount >= v_so.total_amount THEN 'paid'
    WHEN v_paid_amount > 0                  THEN 'partially_paid'
    ELSE                                          'unpaid'
  END;

  SELECT COUNT(*) + 1 INTO v_inv_count FROM invoices;
  v_invoice_id_str := 'INV-' || LPAD(v_inv_count::text, 5, '0');

  v_invoice_type := v_so.customer_type;
  v_issued_date  := CURRENT_DATE;
  v_due_date     := CASE v_invoice_type
    WHEN 'cash' THEN CURRENT_DATE
    ELSE             CURRENT_DATE + 30
  END;

  INSERT INTO invoices (
    invoice_id, customer_id, sale_order_id,
    division_id,
    invoice_type, doc_status, status, payment_status, needs_refresh,
    total_amount, subtotal, tax, paid_amount,
    issued_date, due_date,
    source, source_id, source_label
  ) VALUES (
    v_invoice_id_str, v_so.customer_id, p_so_id,
    v_so.division_id,
    v_invoice_type::public.invoice_type, 'draft', 'draft', v_payment_status, false,
    v_so.total_amount, v_so.subtotal, v_so.tax, v_paid_amount,
    v_issued_date, v_due_date,
    'order', p_so_id::text, 'SO #' || v_so.so_number
  )
  RETURNING id, invoice_id INTO v_new_inv_id, v_new_inv_str;

  UPDATE public.payments
  SET    source_type = 'invoice',
         source_id   = v_new_inv_id
  WHERE  source_type = 'sale_order'
    AND  source_id   = p_so_id
    AND  deleted_at IS NULL;

  INSERT INTO invoice_line_items (invoice_id, description, qty, unit_price, total)
  SELECT v_new_inv_id, sol.item_name, sol.qty, sol.unit_price, sol.total
  FROM   sale_order_lines sol
  WHERE  sol.sale_order_id = p_so_id;

  RETURN jsonb_build_object(
    'id',           v_new_inv_id,
    'invoice_id',   v_new_inv_str,
    'invoice_type', v_invoice_type,
    'paid_amount',  v_paid_amount
  );
END;
$$;

-- 22b. allocate_payment_to_bill — read from `bills` instead of `invoices`
CREATE OR REPLACE FUNCTION public.allocate_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid,
  p_amount     numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_manually_paid   BOOLEAN;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  SELECT total_amount, manually_paid INTO v_bill_total, v_manually_paid
  FROM bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE bills
     SET paid_amount    = v_total_paid,
         payment_status = CASE WHEN v_manually_paid THEN payment_status ELSE v_new_status END
   WHERE id = p_bill_id;
END;
$$;

-- 22c. recalculate_ar_invoice_payment_status — remove direction filter
-- (This is called internally by trigger; kept for AR invoices)
CREATE OR REPLACE FUNCTION public.recalculate_ar_invoice_payment_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total    NUMERIC;
  v_paid     NUMERIC;
  v_new      TEXT;
BEGIN
  SELECT total_amount INTO v_total
  FROM   invoices WHERE id = p_invoice_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO   v_paid
  FROM   payments
  WHERE  (
           (source_type = 'invoice' AND source_id = p_invoice_id)
           OR invoice_id = p_invoice_id
         )
    AND  deleted_at IS NULL
    AND  direction = 'incoming';

  v_new := CASE
    WHEN v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0        THEN 'partially_paid'
    ELSE                        'unpaid'
  END;

  UPDATE invoices
  SET    paid_amount    = v_paid,
         payment_status = v_new
  WHERE  id = p_invoice_id;
END;
$$;

-- 22d. mark_overdue_invoices — AR only (no direction column anymore)
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE invoices
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;

-- 22d-2. mark_overdue_bills — AP version
CREATE OR REPLACE FUNCTION public.mark_overdue_bills()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE bills
  SET    payment_status = 'overdue'
  WHERE  payment_status NOT IN ('paid')
    AND  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
    AND  due_date < NOW();
END;
$$;

-- 22e. get_invoice_summary — AR only, no direction filter
CREATE OR REPLACE FUNCTION public.get_invoice_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'status_counts', (
      SELECT jsonb_object_agg(payment_status, cnt)
      FROM (
        SELECT payment_status::text, COUNT(*)::int AS cnt
        FROM   invoices
        WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
        GROUP BY payment_status
      ) sc
    ),
    'outstanding', (
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      FROM   invoices
      WHERE  COALESCE(status, 'draft') NOT IN ('void', 'cancelled')
        AND  payment_status != 'paid'
    )
  );
$$;

-- 22f. get_customer_pending_balances — remove direction filter
CREATE OR REPLACE FUNCTION public.get_customer_pending_balances()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(grouped))
  INTO result
  FROM (
    SELECT
      c.id                                        AS customer_id,
      c.name                                      AS customer_name,
      (
        SELECT COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'id',         cp.id,
                     'phone',      cp.phone,
                     'is_primary', cp.is_primary,
                     'label',      cp.label
                   )
                   ORDER BY cp.is_primary DESC, cp.created_at ASC
                 ),
                 '[]'::jsonb
               )
        FROM   customer_phones cp
        WHERE  cp.customer_id = c.id
      )                                           AS phones,
      i.division_id,
      d.name                                      AS division_name,
      SUM(COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0))
                                                  AS total_pending,
      COUNT(i.id)                                 AS invoice_count,
      COUNT(i.id) FILTER (WHERE i.payment_status = 'overdue')
                                                  AS overdue_count,
      jsonb_agg(
        jsonb_build_object(
          'id',             i.id,
          'invoice_id',     i.invoice_id,
          'phone_id',       i.phone_id,
          'division_id',    i.division_id,
          'division_name',  d.name,
          'source_type',    i.source::text,
          'source_id',      i.source_id,
          'source_label',   i.source_label,
          'issued_date',    i.issued_date,
          'due_date',       i.due_date,
          'total_amount',   i.total_amount,
          'paid_amount',    COALESCE(i.paid_amount, 0),
          'payment_status', i.payment_status::text
        )
        ORDER BY i.due_date ASC
      )                                           AS invoices
    FROM   invoices i
    JOIN   customers c          ON c.id = i.customer_id
    LEFT JOIN company_divisions d ON d.id = i.division_id
    WHERE  COALESCE(i.status, 'draft') NOT IN ('void', 'cancelled')
      AND  i.payment_status != 'paid'
      AND  (COALESCE(i.total_amount, 0) - COALESCE(i.paid_amount, 0)) > 0
    GROUP BY c.id, c.name, i.division_id, d.name
    ORDER BY total_pending DESC
  ) grouped;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 22g. rpc_financial_dashboard — invoices for AR, bills for AP
CREATE OR REPLACE FUNCTION rpc_financial_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;

  receivables_total          numeric;
  receivables_overdue        numeric;
  receivables_overdue_count  bigint;

  payables_total             numeric;
  payables_overdue           numeric;
  payables_overdue_count     bigint;

  cash_in_this_month         numeric;
  cash_out_this_month        numeric;
  cash_in_last_month         numeric;
  cash_out_last_month        numeric;

  invoiced_this_month        numeric;
  billed_this_month          numeric;

  monthly_trend              jsonb;
  top_overdue_customers      jsonb;
  top_overdue_suppliers      jsonb;

  v_month_start              date := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_last_month_start         date := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date;
BEGIN
  -- AR receivables from invoices
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO receivables_total, receivables_overdue, receivables_overdue_count
  FROM invoices
  WHERE payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  -- AP payables from bills
  SELECT
    COALESCE(SUM(total_amount - paid_amount), 0),
    COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN total_amount - paid_amount END), 0),
    COALESCE(COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END), 0)
  INTO payables_total, payables_overdue, payables_overdue_count
  FROM bills
  WHERE payment_status != 'paid'
    AND doc_status != 'rejected'
    AND total_amount - paid_amount > 0;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_this_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_this_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_month_start
    AND date <= CURRENT_DATE;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_in_last_month
  FROM payments
  WHERE direction = 'incoming'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0)
  INTO cash_out_last_month
  FROM payments
  WHERE direction = 'outgoing'
    AND status IN ('completed', 'pending', 'processing')
    AND deleted_at IS NULL
    AND date >= v_last_month_start
    AND date < v_month_start;

  -- Invoiced this month from invoices (AR)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO invoiced_this_month
  FROM invoices
  WHERE doc_status != 'rejected'
    AND issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  -- Billed this month from bills (AP)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO billed_this_month
  FROM bills
  WHERE doc_status != 'rejected'
    AND issued_date >= v_month_start
    AND issued_date <= CURRENT_DATE;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.month), '[]'::jsonb)
  INTO monthly_trend
  FROM (
    SELECT
      TO_CHAR(m.month, 'YYYY-MM') AS month,
      TO_CHAR(m.month, 'Mon') AS label,
      COALESCE((
        SELECT SUM(total_amount) FROM invoices
        WHERE DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS invoiced,
      COALESCE((
        SELECT SUM(total_amount) FROM bills
        WHERE DATE_TRUNC('month', issued_date) = m.month
          AND doc_status != 'rejected'
      ), 0) AS billed,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'incoming'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS collected,
      COALESCE((
        SELECT SUM(COALESCE(amount_qar, amount)) FROM payments
        WHERE direction = 'outgoing'
          AND DATE_TRUNC('month', date) = m.month
          AND status IN ('completed', 'pending', 'processing')
          AND deleted_at IS NULL
      ), 0) AS paid_out
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
      DATE_TRUNC('month', CURRENT_DATE),
      '1 month'
    ) AS m(month)
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_customers
  FROM (
    SELECT
      c.id,
      c.name,
      SUM(i.total_amount - i.paid_amount) AS amount,
      COUNT(*) AS invoice_count,
      MIN(i.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(i.due_date))::int AS days_overdue
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.due_date < CURRENT_DATE
      AND i.payment_status != 'paid'
      AND i.doc_status != 'rejected'
      AND i.total_amount - i.paid_amount > 0
    GROUP BY c.id, c.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO top_overdue_suppliers
  FROM (
    SELECT
      s.id,
      s.name,
      SUM(b.total_amount - b.paid_amount) AS amount,
      COUNT(*) AS bill_count,
      MIN(b.due_date) AS oldest_due,
      (CURRENT_DATE - MIN(b.due_date))::int AS days_overdue
    FROM bills b
    JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.due_date < CURRENT_DATE
      AND b.payment_status != 'paid'
      AND b.doc_status != 'rejected'
      AND b.total_amount - b.paid_amount > 0
    GROUP BY s.id, s.name
    ORDER BY amount DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'receivables', jsonb_build_object(
      'total', receivables_total,
      'overdue', receivables_overdue,
      'overdue_count', receivables_overdue_count
    ),
    'payables', jsonb_build_object(
      'total', payables_total,
      'overdue', payables_overdue,
      'overdue_count', payables_overdue_count
    ),
    'cash_this_month', jsonb_build_object(
      'in',  cash_in_this_month,
      'out', cash_out_this_month,
      'net', cash_in_this_month - cash_out_this_month,
      'in_prev',  cash_in_last_month,
      'out_prev', cash_out_last_month,
      'invoiced', invoiced_this_month,
      'billed',   billed_this_month
    ),
    'monthly_trend', monthly_trend,
    'top_overdue_customers', top_overdue_customers,
    'top_overdue_suppliers', top_overdue_suppliers
  );

  RETURN result;
END;
$$;

-- 22h. rpc_purchase_aging_report — read from `bills`
CREATE OR REPLACE FUNCTION rpc_purchase_aging_report()
RETURNS TABLE (
  supplier_id       uuid,
  supplier_name     text,
  current_amt       numeric,
  days_1_30         numeric,
  days_31_60        numeric,
  days_61_90        numeric,
  days_over_90      numeric,
  total_outstanding numeric,
  bill_count        bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.supplier_id,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN b.due_date >= CURRENT_DATE THEN b.total_amount - b.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN b.total_amount - b.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN b.total_amount - b.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN b.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN b.total_amount - b.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE - 90 THEN b.total_amount - b.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(b.total_amount - b.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS bill_count
  FROM bills b
  JOIN suppliers s ON s.id = b.supplier_id
  WHERE b.payment_status != 'paid'
    AND b.doc_status != 'rejected'
    AND b.total_amount - b.paid_amount > 0
  GROUP BY b.supplier_id, s.name
  ORDER BY total_outstanding DESC;
$$;

-- 22i. rpc_sales_aging_report — no direction filter
CREATE OR REPLACE FUNCTION rpc_sales_aging_report()
RETURNS TABLE (
  customer_id       uuid,
  customer_name     text,
  current_amt       numeric,
  days_1_30         numeric,
  days_31_60        numeric,
  days_61_90        numeric,
  days_over_90      numeric,
  total_outstanding numeric,
  invoice_count     bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.total_amount - i.paid_amount END), 0) AS current_amt,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1 THEN i.total_amount - i.paid_amount END), 0) AS days_1_30,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount END), 0) AS days_over_90,
    COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_outstanding,
    COUNT(*) AS invoice_count
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  WHERE i.payment_status != 'paid'
    AND i.doc_status != 'rejected'
    AND i.total_amount - i.paid_amount > 0
  GROUP BY i.customer_id, c.name
  ORDER BY total_outstanding DESC;
$$;

-- 22j. rpc_customer_statement — remove direction filter
CREATE OR REPLACE FUNCTION rpc_customer_statement(
  p_customer_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  txn_date   date,
  txn_type   text,
  reference  text,
  description text,
  debit      numeric,
  credit     numeric
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.issued_date AS txn_date,
    'invoice' AS txn_type,
    i.invoice_id AS reference,
    CASE
      WHEN i.due_date IS NOT NULL THEN 'Invoice — due ' || TO_CHAR(i.due_date, 'DD Mon YYYY')
      ELSE 'Invoice'
    END AS description,
    i.total_amount AS debit,
    0::numeric AS credit
  FROM invoices i
  WHERE i.customer_id = p_customer_id
    AND i.doc_status != 'rejected'
    AND (p_date_from IS NULL OR i.issued_date >= p_date_from)
    AND (p_date_to IS NULL OR i.issued_date <= p_date_to)

  UNION ALL

  SELECT
    p.date AS txn_date,
    'payment' AS txn_type,
    p.payment_id AS reference,
    'Payment — ' || COALESCE(p.method::text, 'unknown')
      || CASE WHEN p.reference IS NOT NULL THEN ' · ' || p.reference ELSE '' END AS description,
    0::numeric AS debit,
    p.amount AS credit
  FROM payments p
  LEFT JOIN sale_orders so ON so.id = p.source_id AND p.source_type = 'sale_order'
  LEFT JOIN invoices inv ON inv.id = p.invoice_id
  WHERE p.direction = 'incoming'
    AND p.deleted_at IS NULL
    AND p.status IN ('completed', 'pending', 'processing')
    AND COALESCE(p.customer_id, so.customer_id, inv.customer_id) = p_customer_id
    AND (p_date_from IS NULL OR p.date >= p_date_from)
    AND (p_date_to IS NULL OR p.date <= p_date_to)

  UNION ALL

  SELECT
    cn.created_at::date AS txn_date,
    'credit_note' AS txn_type,
    cn.credit_note_id AS reference,
    'Credit Note — ' || COALESCE(cn.reason, cn.type) AS description,
    0::numeric AS debit,
    cn.total_amount AS credit
  FROM credit_notes cn
  JOIN invoices inv ON inv.id = cn.invoice_id
  WHERE cn.status != 'draft'
    AND inv.customer_id = p_customer_id
    AND (p_date_from IS NULL OR cn.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR cn.created_at::date <= p_date_to)

  ORDER BY txn_date, txn_type;
$$;

-- 22k. rpc_customer_statement_v2 — remove direction filter
CREATE OR REPLACE FUNCTION rpc_customer_statement_v2(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result        jsonb;
  cust_name     text;
  cust_phone    text;
  cust_type     text;
  account_type  text;
  orders        jsonb;
  totals        jsonb;
  open_count    bigint;
BEGIN
  SELECT c.name, c.phone, c.customer_type::text, cg.name
  INTO cust_name, cust_phone, cust_type, account_type
  FROM customers c
  LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
  WHERE c.id = p_customer_id;

  IF cust_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  WITH sos AS (
    SELECT so.id, so.so_number, so.created_at, so.status, so.total
    FROM sale_orders so
    WHERE so.customer_id = p_customer_id
      AND so.status != 'cancelled'
      AND so.deleted_at IS NULL
  ),
  so_inv AS (
    SELECT sos.id AS so_id, inv.id AS invoice_id
    FROM sos
    LEFT JOIN invoices inv
           ON inv.sale_order_id = sos.id
  ),
  so_paid AS (
    SELECT si.so_id,
           COALESCE(SUM(COALESCE(p.amount_qar, p.amount)), 0) AS paid
    FROM so_inv si
    LEFT JOIN payments p
           ON p.deleted_at IS NULL
          AND (
                (p.source_type = 'sale_order' AND p.source_id = si.so_id)
             OR (si.invoice_id IS NOT NULL
                 AND p.source_type = 'invoice'
                 AND p.source_id = si.invoice_id)
             OR (si.invoice_id IS NOT NULL AND p.invoice_id = si.invoice_id)
              )
    GROUP BY si.so_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO orders
  FROM (
    SELECT sos.id,
           sos.so_number,
           sos.created_at,
           sos.status::text AS status,
           sos.total::numeric AS total,
           COALESCE(sp.paid, 0)::numeric AS paid,
           GREATEST(0, sos.total - COALESCE(sp.paid, 0))::numeric AS outstanding
    FROM sos
    LEFT JOIN so_paid sp ON sp.so_id = sos.id
  ) t;

  SELECT jsonb_build_object(
           'total_orders_value', COALESCE(SUM((o->>'total')::numeric), 0),
           'total_paid',         COALESCE(SUM((o->>'paid')::numeric), 0),
           'total_outstanding',  COALESCE(SUM((o->>'outstanding')::numeric), 0)
         )
  INTO totals
  FROM jsonb_array_elements(orders) o;

  SELECT COALESCE(COUNT(*), 0)
  INTO open_count
  FROM jsonb_array_elements(orders) o
  WHERE (o->>'outstanding')::numeric > 0;

  result := jsonb_build_object(
    'customer', jsonb_build_object(
      'name',         cust_name,
      'phone',        cust_phone,
      'account_type', COALESCE(account_type, INITCAP(cust_type), 'Cash')
    ),
    'orders',            orders,
    'totals',            COALESCE(totals, jsonb_build_object(
                            'total_orders_value', 0,
                            'total_paid',         0,
                            'total_outstanding',  0)),
    'open_orders_count', open_count
  );

  RETURN result;
END;
$$;

-- 22l. customer_credit_used — remove direction filter
CREATE OR REPLACE FUNCTION public.customer_credit_used(
  p_customer_id   uuid,
  p_exclude_so_id uuid DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH invoiced AS (
    SELECT COALESCE(SUM(GREATEST(i.total_amount - COALESCE(i.paid_amount, 0), 0)), 0) AS outstanding
    FROM   invoices i
    WHERE  i.customer_id = p_customer_id
      AND  COALESCE(i.status, 'draft') <> 'cancelled'
      AND  (p_exclude_so_id IS NULL OR COALESCE(i.sale_order_id, gen_random_uuid()) <> p_exclude_so_id)
  ),
  uninvoiced AS (
    SELECT COALESCE(SUM(so.total * COALESCE(so.exchange_rate, 1)), 0) AS open_total
    FROM   sale_orders so
    LEFT   JOIN invoices i
           ON  i.sale_order_id = so.id
    WHERE  so.customer_id = p_customer_id
      AND  so.status      NOT IN ('cancelled')
      AND  so.deleted_at  IS NULL
      AND  (p_exclude_so_id IS NULL OR so.id <> p_exclude_so_id)
      AND  i.id IS NULL
  )
  SELECT (SELECT outstanding FROM invoiced)
       + (SELECT open_total  FROM uninvoiced);
$$;

-- ============================================================
-- 23. Rewrite / create triggers
-- ============================================================

-- 23a. invoice_recompute_paid_fn — AR only (no direction filter needed,
--      invoices table is now AR-only)
CREATE OR REPLACE FUNCTION public.invoice_recompute_paid_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_old_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type = 'invoice' THEN v_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_invoice_id := OLD.invoice_id;
    END IF;
  ELSE
    IF NEW.source_type = 'invoice' THEN v_invoice_id := NEW.source_id;
    ELSIF NEW.invoice_id IS NOT NULL THEN v_invoice_id := NEW.invoice_id;
    END IF;
  END IF;

  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  WITH summed AS (
    SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
    FROM   public.payments
    WHERE  (
             (source_type = 'invoice' AND source_id = v_invoice_id)
             OR invoice_id = v_invoice_id
           )
      AND  deleted_at IS NULL
      AND  direction  = 'incoming'
  )
  UPDATE public.invoices i
  SET    paid_amount    = summed.paid,
         payment_status = CASE
           WHEN summed.paid >= i.total_amount THEN 'paid'
           WHEN summed.paid > 0               THEN 'partially_paid'
           ELSE                                    'unpaid'
         END
  FROM   summed
  WHERE  i.id = v_invoice_id;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_type = 'invoice' THEN v_old_invoice_id := OLD.source_id;
    ELSIF OLD.invoice_id IS NOT NULL THEN v_old_invoice_id := OLD.invoice_id;
    END IF;

    IF v_old_invoice_id IS NOT NULL AND v_old_invoice_id <> v_invoice_id THEN
      WITH summed AS (
        SELECT COALESCE(SUM(COALESCE(amount_qar, amount)), 0) AS paid
        FROM   public.payments
        WHERE  (
                 (source_type = 'invoice' AND source_id = v_old_invoice_id)
                 OR invoice_id = v_old_invoice_id
               )
          AND  deleted_at IS NULL
          AND  direction  = 'incoming'
      )
      UPDATE public.invoices i
      SET    paid_amount    = summed.paid,
             payment_status = CASE
               WHEN summed.paid >= i.total_amount THEN 'paid'
               WHEN summed.paid > 0               THEN 'partially_paid'
               ELSE                                    'unpaid'
             END
      FROM   summed
      WHERE  i.id = v_old_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 23b. payments_redirect_to_invoice_fn — remove direction filter
CREATE OR REPLACE FUNCTION public.payments_redirect_to_invoice_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF NEW.source_type <> 'sale_order' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice_id
  FROM   public.invoices
  WHERE  sale_order_id = NEW.source_id
  LIMIT  1;
  IF v_invoice_id IS NOT NULL THEN
    NEW.source_type := 'invoice';
    NEW.source_id   := v_invoice_id;
    NEW.invoice_id  := v_invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 23c. bills_invalidate_pdf_cache_fn — PDF cache for bills
CREATE OR REPLACE FUNCTION public.bills_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pdf_url IS NOT NULL
     AND (OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.subtotal    IS DISTINCT FROM NEW.subtotal
       OR OLD.tax         IS DISTINCT FROM NEW.tax
       OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
       OR OLD.notes       IS DISTINCT FROM NEW.notes
       OR OLD.paid_amount IS DISTINCT FROM NEW.paid_amount
       OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    NEW.pdf_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bills_invalidate_pdf_cache ON public.bills;
CREATE TRIGGER bills_invalidate_pdf_cache
  BEFORE UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.bills_invalidate_pdf_cache_fn();

-- 23d. bill_line_items_invalidate_parent_pdf_fn
CREATE OR REPLACE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill_id uuid;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NOT NULL THEN
    UPDATE public.bills SET pdf_url = NULL WHERE id = v_bill_id AND pdf_url IS NOT NULL;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bill_line_items_cascade_pdf_invalidation ON public.bill_line_items;
CREATE TRIGGER bill_line_items_cascade_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn();

-- 23e. debit_notes_invalidate_pdf_cache_fn
CREATE OR REPLACE FUNCTION public.debit_notes_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pdf_url IS NOT NULL
     AND (OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.notes       IS DISTINCT FROM NEW.notes
       OR OLD.status      IS DISTINCT FROM NEW.status) THEN
    NEW.pdf_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debit_notes_invalidate_pdf_cache ON public.debit_notes;
CREATE TRIGGER debit_notes_invalidate_pdf_cache
  BEFORE UPDATE ON public.debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.debit_notes_invalidate_pdf_cache_fn();

-- ============================================================
-- 24. Drop `invoice_direction` enum
-- ============================================================

DROP TYPE IF EXISTS public.invoice_direction;

-- ============================================================
-- 25. Re-create AR-specific indexes (direction column is gone)
-- ============================================================

-- idx_invoices_status already exists on (status) from baseline — drop and recreate
-- with payment_status included since we no longer filter by direction
DROP INDEX IF EXISTS public.idx_invoices_status;
CREATE INDEX idx_invoices_status
  ON public.invoices USING btree (status, payment_status);

DROP INDEX IF EXISTS public.idx_invoices_customer_phone;
CREATE INDEX idx_invoices_customer_phone
  ON public.invoices USING btree (customer_id, phone_id);

CREATE INDEX IF NOT EXISTS idx_payments_bill_id
  ON public.payments (bill_id) WHERE bill_id IS NOT NULL;

COMMIT;
