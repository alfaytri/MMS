-- supabase/migrations/20260503000001_extend_employees.sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS site_visit_order     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS site_visit_quotation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nationality          TEXT,
  ADD COLUMN IF NOT EXISTS join_date            DATE,
  ADD COLUMN IF NOT EXISTS avatar_url           TEXT;
