-- Fix quotation schema: add notes column, fix sent_date type, fix expiry_date guard,
-- remove unnecessary SECURITY DEFINER from generate_quotation_id

-- 1. Add notes column (missing from original schema)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Fix sent_date type to TIMESTAMPTZ for precision
--    (was DATE; the save_quotation RPC already passes TIMESTAMPTZ, so casting
--    via server timezone (UTC) would silently mis-record Qatar times UTC+3)
ALTER TABLE quotations
  ALTER COLUMN sent_date TYPE TIMESTAMPTZ
  USING sent_date::TIMESTAMPTZ;

-- 3. Fix generate_quotation_id -- remove unnecessary SECURITY DEFINER
--    (the function only calls nextval(), no elevated privileges required)
CREATE OR REPLACE FUNCTION generate_quotation_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_num   INT  := nextval('quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;

-- 4. Fix save_quotation RPC:
--    a) COALESCE on expiry_date update to guard against NOT NULL constraint violation
--    b) sent_date parameter stays TIMESTAMPTZ (now matches the column type)
--    c) notes column is now present so the INSERT/UPDATE references are valid
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
    expiry_date  = COALESCE(EXCLUDED.expiry_date, quotations.expiry_date),
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
