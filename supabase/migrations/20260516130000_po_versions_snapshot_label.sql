-- Add snapshot_label to distinguish auto-snapshots from manual version saves.
-- Values: 'manual' (user-saved draft/rfq), 'submitted' (sent for approval), 'approved'
ALTER TABLE public.po_versions
  ADD COLUMN IF NOT EXISTS snapshot_label TEXT NOT NULL DEFAULT 'manual';
