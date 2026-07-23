-- Wipe po_versions and rebuild with per-stage versioning.
-- Only this snapshot table is touched — purchase_orders, receivals, bills,
-- inventory_movements, FIFO layers, sales are all untouched.

TRUNCATE TABLE public.po_versions RESTART IDENTITY;

ALTER TABLE public.po_versions
  ADD COLUMN stage text NOT NULL
  CHECK (stage IN ('rfq', 'draft', 'po'));

ALTER TABLE public.po_versions
  DROP CONSTRAINT IF EXISTS po_versions_po_id_version_number_key;

CREATE UNIQUE INDEX po_versions_po_stage_version_uidx
  ON public.po_versions (po_id, stage, version_number);

CREATE INDEX po_versions_po_stage_idx
  ON public.po_versions (po_id, stage);
