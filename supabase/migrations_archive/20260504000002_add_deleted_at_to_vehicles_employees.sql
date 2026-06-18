-- Add soft-delete column to vehicles and employees (same gap as schedules)
ALTER TABLE vehicles  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
