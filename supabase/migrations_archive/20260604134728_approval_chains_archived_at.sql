-- Add archived_at column to approval_chains for soft-archive support.
-- Archived chains are hidden from the UI but preserved for audit history.

ALTER TABLE approval_chains
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
