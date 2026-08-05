-- Section 1.14 — Drop dead columns on inventory_checks
--
-- Audit confirmed six columns are dead:
--   * submitted_by         (FK)  — no writer, no reader
--   * submitted_at              — only writer is the removed useSubmitInventoryCheck hook
--   * submitted_by_name         — same; UI fallback branch removed with this cleanup
--   * reviewed_by          (FK) — no writer, no reader
--   * review_notes              — only writer is the removed useReviewInventoryCheck hook
--   * created_by           (FK) — no writer, no reader
--
-- The active review path (useApproveCheckStep) writes reviewed_by_name /
-- reviewed_at only — those two columns stay. initiated_by_profile_id /
-- initiated_by_name / started_at / notes are all actively used and stay.

BEGIN;

-- Drop FK constraints on the dead FK columns first.
ALTER TABLE public.inventory_checks
    DROP CONSTRAINT IF EXISTS inventory_checks_submitted_by_fkey,
    DROP CONSTRAINT IF EXISTS inventory_checks_reviewed_by_fkey,
    DROP CONSTRAINT IF EXISTS inventory_checks_created_by_fkey;

-- Drop the six dead columns.
ALTER TABLE public.inventory_checks
    DROP COLUMN IF EXISTS submitted_by,
    DROP COLUMN IF EXISTS submitted_at,
    DROP COLUMN IF EXISTS submitted_by_name,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS review_notes,
    DROP COLUMN IF EXISTS created_by;

COMMIT;
