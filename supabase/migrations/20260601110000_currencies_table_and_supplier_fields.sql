-- ─── CURRENCIES TABLE ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS currencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view currencies"
  ON currencies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert currencies"
  ON currencies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update currencies"
  ON currencies FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON currencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed common currencies
INSERT INTO currencies (code, name, symbol, sort_order) VALUES
  ('QAR', 'Qatari Riyal',        '﷼',  1),
  ('USD', 'US Dollar',            '$',   2),
  ('EUR', 'Euro',                 '€',   3),
  ('GBP', 'British Pound',        '£',   4),
  ('SAR', 'Saudi Riyal',          '﷼',  5),
  ('AED', 'UAE Dirham',           'د.إ', 6),
  ('KWD', 'Kuwaiti Dinar',        'د.ك', 7),
  ('BHD', 'Bahraini Dinar',       'BD',  8),
  ('OMR', 'Omani Rial',           '﷼',  9),
  ('INR', 'Indian Rupee',         '₹',  10),
  ('CNY', 'Chinese Yuan',         '¥',  11),
  ('JPY', 'Japanese Yen',         '¥',  12)
ON CONFLICT (code) DO NOTHING;

-- ─── ADD FIELDS TO SUPPLIERS ────────────────────────────────────────────────

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS currency_id     UUID REFERENCES currencies(id),
  ADD COLUMN IF NOT EXISTS supplier_type   TEXT CHECK (supplier_type IN ('local', 'international')) DEFAULT 'local';
