-- Country codes table — feeds every phone input country code selector in the app
CREATE TABLE country_codes (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  iso        TEXT NOT NULL,
  flag       TEXT NOT NULL,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 999
);

ALTER TABLE country_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read country codes"
  ON country_codes FOR SELECT TO authenticated USING (true);

-- Seed: Qatar first, then GCC, then common nationalities
INSERT INTO country_codes (code, iso, flag, name, sort_order) VALUES
  ('+974', 'QA', '🇶🇦', 'Qatar',          0),
  ('+971', 'AE', '🇦🇪', 'UAE',            1),
  ('+966', 'SA', '🇸🇦', 'Saudi Arabia',   2),
  ('+965', 'KW', '🇰🇼', 'Kuwait',         3),
  ('+973', 'BH', '🇧🇭', 'Bahrain',        4),
  ('+968', 'OM', '🇴🇲', 'Oman',           5),
  ('+20',  'EG', '🇪🇬', 'Egypt',          10),
  ('+91',  'IN', '🇮🇳', 'India',          11),
  ('+92',  'PK', '🇵🇰', 'Pakistan',       12),
  ('+880', 'BD', '🇧🇩', 'Bangladesh',     13),
  ('+63',  'PH', '🇵🇭', 'Philippines',    14),
  ('+94',  'LK', '🇱🇰', 'Sri Lanka',      15),
  ('+977', 'NP', '🇳🇵', 'Nepal',          16),
  ('+1',   'US', '🇺🇸', 'United States',  20),
  ('+44',  'GB', '🇬🇧', 'United Kingdom', 21);
