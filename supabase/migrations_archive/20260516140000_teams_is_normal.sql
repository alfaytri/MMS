-- Add is_normal flag to teams.
-- Previously "normal" was implied as NOT is_qc AND NOT is_emergency.
-- Now normal and emergency can coexist; QC remains exclusive.

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_normal BOOLEAN NOT NULL DEFAULT false;

-- All existing non-QC teams are normal teams
UPDATE teams SET is_normal = true WHERE is_qc = false AND deleted_at IS NULL;

-- Drop old constraint that prevented emergency + qc together
ALTER TABLE teams
  DROP CONSTRAINT IF EXISTS check_emergency_xor_qc;

-- New constraint: QC is exclusive — cannot be combined with normal or emergency
ALTER TABLE teams
  ADD CONSTRAINT check_qc_exclusive
  CHECK (NOT (is_qc AND (is_normal OR is_emergency)));
