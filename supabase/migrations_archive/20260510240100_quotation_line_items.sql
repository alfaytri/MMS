-- supabase/migrations/20260510230000_quotation_line_items.sql

-- ── 1. Line items table ──────────────────────────────────────────────────────
CREATE TABLE quotation_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id    UUID REFERENCES services(id),
  name          TEXT NOT NULL,
  path          TEXT[] NOT NULL DEFAULT '{}',
  qty           INT  NOT NULL DEFAULT 1,
  price         NUMERIC NOT NULL,
  duration      INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qli_quotation ON quotation_line_items(quotation_id);

ALTER TABLE quotation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON quotation_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Atomic ID generation ───────────────────────────────────────────────────
-- Uses a DB sequence so concurrent sessions never produce the same number.
CREATE SEQUENCE IF NOT EXISTS quotation_number_seq;

CREATE OR REPLACE FUNCTION generate_quotation_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_num   INT  := nextval('quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;

-- ── 3. Transactional save RPC ────────────────────────────────────────────────
-- Upserts the quotation row and replaces all line items in one transaction.
-- Prevents orphaned line items if the client disconnects mid-save.
CREATE OR REPLACE FUNCTION save_quotation(
  p_quotation_id  TEXT,
  p_customer_id   UUID,
  p_division      TEXT,
  p_status        quotation_status,
  p_total_amount  NUMERIC,
  p_notes         TEXT,
  p_expiry_date   DATE,
  p_sent_date     TIMESTAMPTZ,
  p_line_items    JSONB   -- [{service_id, name, path, qty, price, duration}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quot_id UUID;
BEGIN
  INSERT INTO quotations (
    quotation_id, customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date
  ) VALUES (
    p_quotation_id, p_customer_id, p_division, p_status,
    p_total_amount, NULLIF(p_notes, ''),
    CURRENT_DATE, p_expiry_date, p_sent_date
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    status       = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    notes        = EXCLUDED.notes,
    expiry_date  = EXCLUDED.expiry_date,
    sent_date    = EXCLUDED.sent_date
  RETURNING id INTO v_quot_id;

  -- Replace line items atomically inside the same transaction
  DELETE FROM quotation_line_items WHERE quotation_id = v_quot_id;

  INSERT INTO quotation_line_items (
    quotation_id, service_id, name, path, qty, price, duration
  )
  SELECT
    v_quot_id,
    NULLIF(item->>'service_id', '')::UUID,
    item->>'name',
    ARRAY(SELECT jsonb_array_elements_text(item->'path')),
    (item->>'qty')::INT,
    (item->>'price')::NUMERIC,
    NULLIF(item->>'duration', '')::INT
  FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) AS item;

  RETURN v_quot_id;
END;
$$;
