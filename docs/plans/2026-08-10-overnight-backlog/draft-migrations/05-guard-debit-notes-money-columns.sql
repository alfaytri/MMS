-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_debit_notes_money_columns.sql + mirror.
-- ============================================================================
-- Security P1 — lock a debit note's MONEY columns against direct client writes.
--
-- Finding (audit ../security-p1-audit.md §4): debit notes are created client-side at
-- status='open' with a client-computed total (createDebitNoteForReturn
-- usePurchaseReturns.ts:369). UNLIKE credit_notes, the status transition to
-- 'resolved' IS a legitimate direct client write (useResolveDebitNoteSupplierCredit /
-- useResolveDebitNoteReplacement useCreditNotes.ts:563/593, ApplyDebitNoteDialog.tsx:135
-- all set status='resolved' + resolution_type directly). So this guard must NOT block
-- status — only the money/linkage columns that the DEFINER rpc_apply_debit_note_to_bill
-- (20260806240000:130) owns (remaining_amount, bill_id).
--
-- This BEFORE UPDATE trigger blocks a direct client write that changes any money or
-- linkage column; status + resolution_type + pdf pass. INSERT is legit and NOT guarded.

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
    RAISE EXCEPTION 'A debit note''s amount / linkage cannot be edited by a direct client write — application/void run through their DEFINER RPCs.'
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
