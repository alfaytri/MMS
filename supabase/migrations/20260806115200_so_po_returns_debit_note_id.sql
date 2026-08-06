-- so_po_returns.credit_note_id has been the wrong FK for PO returns since
-- the invoices/bills split (20260721140000): the column references
-- credit_notes(id) but PO-return dispatch code inserts into debit_notes
-- and tries to link the debit_note.id back — every UPDATE has silently
-- failed with FK 23503, so `credit_note_id` is always NULL for
-- source_type='purchase_order' rows. The UI hid the auto-created debit
-- note as a consequence. Same root cause as the PATCH conflict operators
-- hit when cancelling a return that already had a stale credit_note_id
-- value written pre-split.
--
-- Fix:
--   1. Add debit_note_id uuid REFERENCES debit_notes(id). Nullable.
--   2. Backfill from debit_notes.source_return_id (that column WAS being
--      populated correctly).
--   3. Leave credit_note_id in place — sale returns (source_type='sale_order')
--      still use it and its FK to credit_notes IS correct for them.
--
-- The hook rewrite (createDebitNoteForReturn writes debit_note_id; reader
-- resolves DN via debit_note_id) lands in the same PR.

BEGIN;

ALTER TABLE public.so_po_returns
  ADD COLUMN IF NOT EXISTS debit_note_id uuid REFERENCES public.debit_notes(id);

CREATE INDEX IF NOT EXISTS so_po_returns_debit_note_id_idx
  ON public.so_po_returns(debit_note_id)
  WHERE debit_note_id IS NOT NULL;

-- Backfill: every debit_note already carries source_return_id pointing at
-- the return it was created for. Copy that link into the returns table so
-- historic data has the correct pointer.
UPDATE public.so_po_returns r
   SET debit_note_id = dn.id
  FROM public.debit_notes dn
 WHERE dn.source_return_id = r.id
   AND r.debit_note_id IS NULL;

COMMENT ON COLUMN public.so_po_returns.debit_note_id IS
'FK to debit_notes(id) — populated when a PO return is dispatched. Sale
returns use credit_note_id instead (FK to credit_notes(id)).';

COMMIT;
