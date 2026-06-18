-- supabase/migrations/20260425000062_rpc_create_landed_cost.sql
BEGIN;

-- Sequence for race-condition-free lc_number generation
CREATE SEQUENCE IF NOT EXISTS lc_number_seq START 1;

-- Auto-generate lc_number if not supplied (idempotent trigger)
CREATE OR REPLACE FUNCTION _set_lc_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lc_number IS NULL OR NEW.lc_number = '' THEN
    NEW.lc_number := 'LC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(nextval('lc_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lc_number ON landed_costs;
CREATE TRIGGER trg_set_lc_number
  BEFORE INSERT ON landed_costs
  FOR EACH ROW EXECUTE FUNCTION _set_lc_number();

-- RPC: compute total_amount in NUMERIC to avoid float-point errors (Fix #4)
CREATE OR REPLACE FUNCTION create_landed_cost(
  p_description           TEXT,
  p_date                  DATE,
  p_currency              TEXT,
  p_lines                 JSONB,   -- [{description, amount, currency, exchange_rate}]
  p_attached_receival_ids UUID[],
  p_attached_po_ids       UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_id           UUID;
BEGIN
  IF p_lines IS NULL THEN
    RAISE EXCEPTION 'p_lines must not be null';
  END IF;

  -- Sum in NUMERIC — no JavaScript float rounding (Fix #4)
  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE(NULLIF((line->>'exchange_rate')::NUMERIC, 0), 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    lines, attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_lines, p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_landed_cost(TEXT, DATE, TEXT, JSONB, UUID[], UUID[]) TO authenticated;

COMMIT;
