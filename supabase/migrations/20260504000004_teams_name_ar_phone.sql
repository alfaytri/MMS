-- Add columns that the teams UI expects but were missing from initial schema
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ar TEXT,
  ADD COLUMN IF NOT EXISTS phone   TEXT;

-- Backfill name_en from the existing name column
UPDATE teams SET name_en = name WHERE name_en IS NULL OR name_en = '';

-- Make name_en NOT NULL now that it's backfilled
ALTER TABLE teams ALTER COLUMN name_en SET NOT NULL;
ALTER TABLE teams ALTER COLUMN name_en SET DEFAULT '';
