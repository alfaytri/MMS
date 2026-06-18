-- Add site visit capability flags directly to teams table
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS site_visit_order      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS site_visit_quotation  BOOLEAN NOT NULL DEFAULT FALSE;
