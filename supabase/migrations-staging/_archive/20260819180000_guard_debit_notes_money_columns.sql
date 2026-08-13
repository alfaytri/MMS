-- Security P1 — lock a debit note's MONEY columns against direct client writes.
--
-- Finding: debit notes are created client-side at status='open' with a
-- client-computed total (createDebitNoteForReturn). UNLIKE credit_notes, the status
-- transition to 'resolved' IS a legitimate direct client write
-- (useResolveDebitNoteSupplierCredit / useResolveDebitNoteReplacement,
-- useCreditNotes.ts:565/595; ApplyDebitNoteDialog.tsx:137 — all set
-- status='resolved' + resolution_type directly). So this guard must NOT block status
-- — only the money/linkage columns owned by the DEFINER rpc_apply_debit_note_to_bill.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * all guarded columns exist.
--  * the ONLY debit_notes writer is rpc_apply_debit_note_to_bill (prosecdef=true,
--    DEFINER) → passes the gate. NO SECURITY INVOKER writer.
--  * the direct client UPDATEs (grep) set only {status, resolution_type} or {pdf_url}
--    — NONE of the guarded money columns — so this guard breaks no client flow.

CREATE OR REPLACE FUNCTION public.guard_debit_notes_money_columns()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller.
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (
       NEW.total_amount      IS DISTINCT FROM OLD.total_amount
    OR NEW.original_total    IS DISTINCT FROM OLD.original_total
    OR NEW.new_total         IS DISTINCT FROM OLD.new_total
    OR NEW.remaining_amount  IS DISTINCT FROM OLD.remaining_amount
    OR NEW.bill_id           IS DISTINCT FROM OLD.bill_id
    OR NEW.supplier_id       IS DISTINCT FROM OLD.supplier_id
    OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
    OR NEW.source_return_id  IS DISTINCT FROM OLD.source_return_id
  ) THEN
    RAISE EXCEPTION 'A debit note''s amount / linkage cannot be edited by a direct client write — application/offset runs through rpc_apply_debit_note_to_bill.'
      USING ERRCODE = '42501';
  END IF;

  -- NB: status and resolution_type are intentionally NOT guarded — the client
  -- legitimately sets status='resolved' + resolution_type on manual resolution.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_debit_notes_money_columns ON public.debit_notes;
CREATE TRIGGER trg_guard_debit_notes_money_columns
BEFORE UPDATE ON public.debit_notes
FOR EACH ROW
EXECUTE FUNCTION public.guard_debit_notes_money_columns();

REVOKE ALL ON public.debit_notes FROM anon;
