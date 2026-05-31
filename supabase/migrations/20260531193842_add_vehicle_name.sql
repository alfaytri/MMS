-- Add a human-readable name to vehicles (optional — plate is still required)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name text;
