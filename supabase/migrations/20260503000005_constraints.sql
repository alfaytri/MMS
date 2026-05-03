-- Add is_emergency and is_qc boolean columns derived from the existing tag enum
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_qc        BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing tag enum values
UPDATE teams SET is_emergency = true WHERE tag = 'emergency';
UPDATE teams SET is_qc        = true WHERE tag = 'qc';

-- EMR/QC are mutually exclusive at DB level
ALTER TABLE teams
  ADD CONSTRAINT check_emergency_xor_qc CHECK (NOT (is_emergency AND is_qc));

-- Add traccar_device_id columns
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS traccar_device_id TEXT;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS traccar_device_id TEXT;

-- Traccar device IDs must be unique
ALTER TABLE teams
  ADD CONSTRAINT teams_traccar_device_id_unique UNIQUE (traccar_device_id);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_traccar_device_id_unique UNIQUE (traccar_device_id);
