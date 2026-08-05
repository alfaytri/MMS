-- Debit-note dedup fix.
-- Bug: the DN insert in usePurchaseReturns has no uniqueness check, so
-- double-clicks / retries create duplicate DNs against the same return.
-- Real example in prod: DN-00002 + DN-00003 both pointing to PR-00002.
--
-- Fix:
--   1. Delete duplicate DNs, keeping the earliest per source_return_id.
--   2. Add a partial unique index so the DB rejects future duplicates.
-- The client-side check-then-insert is added separately in usePurchaseReturns.
BEGIN;

-- 1. Delete duplicates: keep the earliest created_at per source_return_id.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source_return_id ORDER BY created_at, id) AS rn
  FROM   debit_notes
  WHERE  source_return_id IS NOT NULL
), losers AS (
  SELECT id FROM ranked WHERE rn > 1
)
-- Unlink any so_po_returns rows that pointed at a duplicate DN we're about to
-- delete (otherwise the FK on credit_note_id would block us).
UPDATE so_po_returns
   SET credit_note_id = NULL
 WHERE credit_note_id IN (SELECT id FROM losers);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY source_return_id ORDER BY created_at, id) AS rn
  FROM   debit_notes
  WHERE  source_return_id IS NOT NULL
)
DELETE FROM debit_notes
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Partial unique index — prevents future duplicates at the DB layer.
CREATE UNIQUE INDEX IF NOT EXISTS debit_notes_source_return_id_unique
    ON public.debit_notes (source_return_id)
 WHERE source_return_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
