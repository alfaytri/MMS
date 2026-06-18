-- supabase/migrations/20260419000000_purchase_sales_expansion.sql

-- ── 1. Extend invoices ─────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS direction          TEXT NOT NULL DEFAULT 'ar'
    CHECK (direction IN ('ar', 'ap')),
  ADD COLUMN IF NOT EXISTS supplier_id        UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS receival_id        UUID REFERENCES receivals(id),
  ADD COLUMN IF NOT EXISTS sale_order_id      UUID REFERENCES sale_orders(id),
  ADD COLUMN IF NOT EXISTS sale_delivery_id   UUID REFERENCES sale_deliveries(id),
  ADD COLUMN IF NOT EXISTS needs_refresh      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_status         TEXT NOT NULL DEFAULT 'draft'
    CHECK (doc_status IN (
      'draft','ready_to_send','sent',
      'pending_approval','approved','rejected'
    )),
  ADD COLUMN IF NOT EXISTS payment_status     TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN (
      'unpaid','partially_paid','paid','overdue'
    ));

-- Backfill doc_status + payment_status from the legacy status column (AR rows only)
UPDATE invoices SET
  doc_status = CASE
    WHEN status IN ('sent','partially_paid','paid','overdue') THEN 'sent'
    ELSE 'draft'
  END,
  payment_status = CASE
    WHEN status = 'partially_paid' THEN 'partially_paid'
    WHEN status = 'paid'           THEN 'paid'
    WHEN status = 'overdue'        THEN 'overdue'
    ELSE 'unpaid'
  END
WHERE direction = 'ar';

-- ── 2. Extend invoice_line_items ──────────────────────────────────────────
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS match_status TEXT
    CHECK (match_status IN (
      'matched','qty_discrepancy','price_discrepancy','unmatched','accepted_with_note'
    )),
  ADD COLUMN IF NOT EXISTS match_note TEXT;

-- ── 3. Extend payments ────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming','outgoing'));

-- ── 4. Extend customers ───────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── 5. Make sale_deliveries.warehouse_id nullable ─────────────────────────
ALTER TABLE sale_deliveries
  ALTER COLUMN warehouse_id DROP NOT NULL;

-- ── 6. Create credit_note_lines ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id  UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES invoice_line_items(id),
  description     TEXT NOT NULL,
  qty             NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Create payment_plans ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('schedule','adhoc')),
  total_amount  NUMERIC(12,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 8. Create payment_installments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  due_date     DATE,
  amount       NUMERIC(12,2) NOT NULL,
  paid_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','partial')),
  payment_id   UUID REFERENCES payments(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 9. DB Views ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW customer_invoices AS
  SELECT * FROM invoices WHERE direction = 'ar';

CREATE OR REPLACE VIEW supplier_bills AS
  SELECT * FROM invoices WHERE direction = 'ap';
