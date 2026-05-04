-- Add soft-delete support to schedules (column was missing from initial migration)
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
