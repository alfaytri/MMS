-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_credit_notes_immutable.sql + mirror.
-- ============================================================================
-- Security P1 — lock a credit note's amount / status / linkage against direct
-- client writes.
--
-- Finding (audit ../security-p1-audit.md §3): the client INSERTs credit notes at
-- status='open' with a client-computed total (useIssueCreditNote useInvoices.ts:209,
-- useCreateCreditNote useCreditNotes.ts:256, createCreditNoteForReturn
-- useSaleReturns.ts:366) and later UPDATEs ONLY resolution metadata
-- (resolution_type, refund_method, refund_reference — useCreditNotes.ts:94/388).
-- The status transition to 'resolved' is set exclusively by the DEFINER
-- rpc_redeem_credit_note (20260806220000:143). So the client never legitimately
-- changes status, total_amount, or the linkage after creation.
--
-- This BEFORE UPDATE trigger blocks a direct client write that changes amount,
-- status, or linkage; resolution metadata + pdf/reason edits pass. INSERT is legit
-- and NOT guarded.

CREATE OR REPLACE FUNCTION public.guard_credit_notes_immutable()
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
       NEW.total_amount     IS DISTINCT FROM OLD.total_amount
    OR NEW.status           IS DISTINCT FROM OLD.status
    OR NEW.original_total   IS DISTINCT FROM OLD.original_total
    OR NEW.new_total        IS DISTINCT FROM OLD.new_total
    OR NEW.invoice_id       IS DISTINCT FROM OLD.invoice_id
    OR NEW.customer_id      IS DISTINCT FROM OLD.customer_id
    OR NEW.source_return_id IS DISTINCT FROM OLD.source_return_id
  ) THEN
    RAISE EXCEPTION 'A credit note''s amount / status / linkage cannot be edited by a direct client write — issuance/redemption/void run through their DEFINER RPCs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_credit_notes_immutable ON public.credit_notes;
CREATE TRIGGER trg_guard_credit_notes_immutable
BEFORE UPDATE ON public.credit_notes
FOR EACH ROW
EXECUTE FUNCTION public.guard_credit_notes_immutable();

REVOKE ALL ON public.credit_notes FROM anon;
