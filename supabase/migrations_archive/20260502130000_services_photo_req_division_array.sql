-- Add photo_requirement column for service photo workflow
ALTER TABLE services ADD COLUMN IF NOT EXISTS photo_requirement text DEFAULT 'none';

-- Change division from a single text slug to a text array (multi-division support)
-- Converts existing single-value rows into single-element arrays, preserving all data.
ALTER TABLE services
  ALTER COLUMN division TYPE text[]
  USING CASE
    WHEN division IS NULL OR division = '' THEN NULL
    ELSE ARRAY[division]::text[]
  END;

ALTER TABLE services ALTER COLUMN division SET DEFAULT '{}';
