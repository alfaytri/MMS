-- Security P1 — lock so_invoices totals / linkage and non-void status against
-- direct client writes.
--
-- Finding: the only legitimate direct client UPDATEs are useVoidInvoice
-- (status='void' + notes), useBulkQbSyncInvoices (qb_synced) and useDismissRefresh
-- (needs_refresh). Totals are set by the DEFINER builders generate_invoice_from_so /
-- rpc_sync_invoice_from_so; a permitted clerk could otherwise raw-PostgREST
-- total_amount / subtotal on an issued invoice.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * so_invoices relkind = 'r' (base table — trigger-attachable, NOT the legacy
--    `invoices` name).
--  * invoice_status enum = {draft,sent,partially_paid,paid,overdue,cancelled,void}
--    — 'void' is a real label.
--  * all guarded columns exist.
--  * so_invoices writers: generate_invoice_from_so, rpc_sync_invoice_from_so,
--    rpc_redeem_credit_note, rpc_settle_installment, recalculate_ar_invoice_payment_status,
--    mark_overdue_invoices, set_invoice_pdf_url are all prosecdef=true → pass the gate.
--  * TWO writers are SECURITY INVOKER:
--      - invoice_recompute_paid_fn — AFTER trigger on payments; UPDATEs
--        so_invoices.paid_amount + payment_status, runs as the caller (authenticated)
--        when a client records a payment. => paid_amount / payment_status are
--        deliberately NOT guarded (guarding them would break payment recording).
--        They are derived values recomputed from payments anyway.
--      - invoice_line_items_invalidate_parent_pdf_fn — only sets pdf_url = NULL (not
--        a guarded column) → never trips this guard.
--
-- Guards totals + relinking + forged non-void status. paid_amount/payment_status
-- (INVOKER-recompute-owned) and notes/qb_synced/needs_refresh/pdf_url (client-legit)
-- are intentionally allowed.

CREATE OR REPLACE FUNCTION public.guard_so_invoice_amounts()
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
       NEW.total_amount  IS DISTINCT FROM OLD.total_amount
    OR NEW.subtotal      IS DISTINCT FROM OLD.subtotal
    OR NEW.customer_id   IS DISTINCT FROM OLD.customer_id
    OR NEW.sale_order_id IS DISTINCT FROM OLD.sale_order_id
  ) THEN
    RAISE EXCEPTION 'so_invoice totals / linkage are set by the invoice builder RPCs and cannot be changed by a direct client write.'
      USING ERRCODE = '42501';
  END IF;

  -- Only 'void' is a client-settable status transition; every other status is
  -- workflow/DEFINER-owned (generate/sync/mark_overdue).
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'void' THEN
    RAISE EXCEPTION 'so_invoice status "%" can only be set by the invoice workflow (only void is client-settable).', NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_so_invoice_amounts ON public.so_invoices;
CREATE TRIGGER trg_guard_so_invoice_amounts
BEFORE UPDATE ON public.so_invoices
FOR EACH ROW
EXECUTE FUNCTION public.guard_so_invoice_amounts();

REVOKE ALL ON public.so_invoices FROM anon;
