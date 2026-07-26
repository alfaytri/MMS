-- Enum Conversion Pass 3 pilot: po_edit_requests.status
--
-- Converts po_edit_requests.status from text (CHECK-constrained) to a
-- native enum. Also renames the legacy 'declined' value to 'rejected'
-- for consistency with other status enums in the project (approval_status,
-- credit_note_status, receival_status, etc.).
--
-- App-side writers were updated in the same commit — this migration
-- brings the DB into sync.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rename legacy 'declined' rows so they fit the new enum vocabulary
-- ---------------------------------------------------------------------------

UPDATE public.po_edit_requests
SET    status = 'rejected'
WHERE  status = 'declined';

-- ---------------------------------------------------------------------------
-- 2. Pre-flight: every remaining value must fit the target enum set
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO bad
  FROM public.po_edit_requests
  WHERE status NOT IN ('pending', 'approved', 'rejected', 'used');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'po_edit_requests.status has unexpected values: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Drop constraint, indexes, and default that reference the text column
-- ---------------------------------------------------------------------------

ALTER TABLE public.po_edit_requests
  DROP CONSTRAINT IF EXISTS po_edit_requests_status_check;

DROP INDEX IF EXISTS public.po_edit_requests_pending_idx;
DROP INDEX IF EXISTS public.po_edit_requests_one_approved_per_po;

ALTER TABLE public.po_edit_requests ALTER COLUMN status DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 4. Create enum + retype column
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.po_edit_request_status AS ENUM ('pending', 'approved', 'rejected', 'used');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.po_edit_requests
  ALTER COLUMN status TYPE public.po_edit_request_status USING status::public.po_edit_request_status;

ALTER TABLE public.po_edit_requests
  ALTER COLUMN status SET DEFAULT 'pending'::public.po_edit_request_status;

-- ---------------------------------------------------------------------------
-- 5. Recreate partial indexes with typed predicates
-- ---------------------------------------------------------------------------

CREATE INDEX po_edit_requests_pending_idx
  ON public.po_edit_requests(po_id)
  WHERE status = 'pending'::public.po_edit_request_status;

CREATE UNIQUE INDEX po_edit_requests_one_approved_per_po
  ON public.po_edit_requests(po_id)
  WHERE status = 'approved'::public.po_edit_request_status;

COMMIT;
