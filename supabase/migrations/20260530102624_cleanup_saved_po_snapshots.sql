-- Remove stale po_versions rows created by the old "snapshot on every save" logic.
-- Only submitted/approved snapshots are meaningful lifecycle events.
DELETE FROM po_versions WHERE snapshot_label = 'saved';
