-- Convert po_versions.stage from text + CHECK to a proper enum.
--
-- The three allowed values ('rfq', 'draft', 'po') have been stable since the
-- column was introduced in 20260625100000_po_versions_stage_column. Promoting
-- it to an enum tightens the generated TS types (Row.stage becomes the enum
-- union instead of `string`) and matches the style of po_status / po_type
-- which are already enums.
--
-- If a fourth stage is ever needed later:  ALTER TYPE public.po_stage ADD VALUE 'quote';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_stage') THEN
    CREATE TYPE public.po_stage AS ENUM ('rfq', 'draft', 'po');
  END IF;
END $$;

ALTER TABLE public.po_versions
  DROP CONSTRAINT IF EXISTS po_versions_stage_check;

ALTER TABLE public.po_versions
  ALTER COLUMN stage TYPE public.po_stage
  USING stage::public.po_stage;
