-- Security P1 — lock a credit note's amount / status / linkage against direct
-- client writes.
--
-- Finding: the client INSERTs credit notes at status='open' with a client-computed
-- total, and later UPDATEs ONLY resolution metadata — resolveCreditNoteViaLedger
-- (resolution_type, useCreditNotes.ts:96) and useResolveCreditNoteRefund
-- (refund_method, refund_reference, :390). The status transition to 'resolved' is
-- set exclusively by DEFINER RPCs. So the client never legitimately changes status,
-- amount, or linkage after creation.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * all guarded columns exist.
--  * EVERY credit_notes writer is prosecdef=true (DEFINER): _maybe_close_return,
--    _record_customer_resolution, rpc_close_return, rpc_record_return_refund,
--    rpc_redeem_credit_note, set_credit_note_pdf_url. NO SECURITY INVOKER writer.
--  * the only direct client UPDATEs (grep) set resolution_type / refund_method /
--    refund_reference — none of the guarded columns — so blocking status here is safe
--    (unlike debit_notes, where the client legitimately sets status='resolved').

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
    RAISE EXCEPTION 'A credit note''s amount / status / linkage cannot be edited by a direct client write — issuance/redemption/resolution run through their DEFINER RPCs.'
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
