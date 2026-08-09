-- Security P1 — lock a purchase order's financial/commitment columns once it is
-- approved (or beyond), against direct client writes.
--
-- The existing guard (20260819060000) blocks a direct client write from setting a
-- privileged *status*. But nothing stopped a division member from editing the PO's
-- other fields — supplier, amounts, fx rate, discount, terms — directly via
-- PostgREST on a PO that is already approved/received, silently altering what was
-- approved without re-approval.
--
-- This guard blocks a direct client write that changes any financial/commitment
-- column while the PO STAYS in a locked state (approved / partially_received /
-- received / completed / cancelled). The nuance: the legitimate way to change an
-- approved PO is to *amend* it, which transitions it back to pending_approval (or
-- draft) in the same save — so we only block when NEW.status = OLD.status (i.e.
-- the PO is NOT transitioning out of the locked state). SECURITY DEFINER workflow
-- RPCs (receival, FX recompute, booked-rate change, approval actions) run as the
-- owner role and pass.
--
-- Verified before writing (staging mwvblpgbgxipvrevkeff, 2026-08-09):
--  * Every function that updates purchase_orders is SECURITY DEFINER except the
--    AFTER trigger po_line_items_invalidate_parent_pdf_fn, which only nulls
--    pdf/cache columns (never a locked column) — so it never trips this guard.
--  * The client editable states are draft + pending_approval (canEdit). Editing an
--    approved PO goes through amend → the resubmit update sets status=
--    'pending_approval' (transition out) in the same statement, so NEW.status !=
--    OLD.status and this guard is skipped. RFQ-award / save-as-draft happen in
--    draft. No legit client flow changes a locked column while keeping the PO in a
--    locked status.

CREATE OR REPLACE FUNCTION public.guard_po_locked_columns()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller.
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('approved', 'partially_received', 'received', 'completed', 'cancelled')
     AND NEW.status = OLD.status   -- staying locked; a transition out (amend) is allowed
     AND (
          NEW.supplier_id           IS DISTINCT FROM OLD.supplier_id
       OR NEW.supplier_name         IS DISTINCT FROM OLD.supplier_name
       OR NEW.currency              IS DISTINCT FROM OLD.currency
       OR NEW.exchange_rate         IS DISTINCT FROM OLD.exchange_rate
       OR NEW.initial_exchange_rate IS DISTINCT FROM OLD.initial_exchange_rate
       OR NEW.subtotal              IS DISTINCT FROM OLD.subtotal
       OR NEW.total_qar             IS DISTINCT FROM OLD.total_qar
       OR NEW.discount_amount       IS DISTINCT FROM OLD.discount_amount
       OR NEW.discount_label        IS DISTINCT FROM OLD.discount_label
       OR NEW.payment_terms         IS DISTINCT FROM OLD.payment_terms
       OR NEW.payment_terms_notes   IS DISTINCT FROM OLD.payment_terms_notes
       OR NEW.payment_milestones    IS DISTINCT FROM OLD.payment_milestones
       OR NEW.delivery_terms        IS DISTINCT FROM OLD.delivery_terms
       OR NEW.delivery_terms_notes  IS DISTINCT FROM OLD.delivery_terms_notes
       OR NEW.expected_delivery     IS DISTINCT FROM OLD.expected_delivery
       OR NEW.quote_deadline        IS DISTINCT FROM OLD.quote_deadline
     )
  THEN
    RAISE EXCEPTION 'A "%" purchase order''s amounts/terms cannot be edited directly — amend it (which returns it to pending approval) first.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_locked_columns ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_locked_columns
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_po_locked_columns();
