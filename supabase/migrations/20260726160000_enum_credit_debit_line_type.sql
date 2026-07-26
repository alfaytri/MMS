-- ============================================================
-- Enum Pass 3: credit_note_lines.line_type + debit_note_lines.line_type
-- Convert both text columns to a shared native enum: credit_debit_line_type
-- Vocabulary in current use (verified from writers): 'original', 'returned'
-- ============================================================

-- ------------------------------------------------------------
-- Pre-flight guard: verify data only contains canonical values
-- ------------------------------------------------------------
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM public.credit_note_lines
  WHERE line_type IS NOT NULL AND line_type NOT IN ('original', 'returned');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'credit_note_lines.line_type has % rows with non-canonical values', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count
  FROM public.debit_note_lines
  WHERE line_type IS NOT NULL AND line_type NOT IN ('original', 'returned');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'debit_note_lines.line_type has % rows with non-canonical values', bad_count;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Create the enum type (idempotent)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_debit_line_type') THEN
    CREATE TYPE public.credit_debit_line_type AS ENUM ('original', 'returned');
  END IF;
END $$;

-- ------------------------------------------------------------
-- credit_note_lines.line_type: drop index + default, retype, restore
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_credit_note_lines_type;

ALTER TABLE public.credit_note_lines
  ALTER COLUMN line_type DROP DEFAULT;

ALTER TABLE public.credit_note_lines
  ALTER COLUMN line_type TYPE public.credit_debit_line_type
  USING line_type::public.credit_debit_line_type;

ALTER TABLE public.credit_note_lines
  ALTER COLUMN line_type SET DEFAULT 'returned'::public.credit_debit_line_type;

CREATE INDEX idx_credit_note_lines_type
  ON public.credit_note_lines(credit_note_id, line_type);

-- ------------------------------------------------------------
-- debit_note_lines.line_type: same treatment (no index existed)
-- ------------------------------------------------------------
ALTER TABLE public.debit_note_lines
  ALTER COLUMN line_type DROP DEFAULT;

ALTER TABLE public.debit_note_lines
  ALTER COLUMN line_type TYPE public.credit_debit_line_type
  USING line_type::public.credit_debit_line_type;

ALTER TABLE public.debit_note_lines
  ALTER COLUMN line_type SET DEFAULT 'returned'::public.credit_debit_line_type;

-- ------------------------------------------------------------
-- Notify PostgREST to reload schema so the new column type is picked up
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
