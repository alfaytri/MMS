-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_so_invoice_amounts.sql + mirror.
-- ============================================================================
-- Security P1 — lock so_invoices totals / balance / linkage and non-void status
-- against direct client writes.
--
-- Finding (audit ../security-p1-audit.md §2): the only legitimate direct client
-- UPDATEs are useVoidInvoice (status='void' + notes, useInvoices.ts:157),
-- useBulkQbSyncInvoices (qb_synced, :273) and useDismissRefresh (needs_refresh,
-- useCustomerInvoices.ts:113). Totals + paid_amount/payment_status are maintained
-- by the AFTER recompute trigger (invoice_recompute_paid_fn) and by the DEFINER
-- builders generate_invoice_from_so / rpc_sync_invoice_from_so (20260807005000).
-- A permitted clerk could otherwise raw-PostgREST `total_amount`/`paid_amount` on
-- an issued invoice.
--
-- ⚠ MORNING PRE-CHECK (blocking): confirm the LIVE physical table the app writes is
--   public.so_invoices (base table, trigger-attachable) — not the legacy public.invoices
--   name some older recompute triggers reference. Also confirm the exact total column
--   names on staging: this draft blocks total_amount / subtotal / paid_amount /
--   payment_status / customer_id / sale_order_id. If the live schema also has
--   `total` / `tax_amount` / `discount_*` / `issued_date` / `due_date` and they are
--   trigger/RPC-owned, ADD them to the check before shipping.

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
       NEW.total_amount   IS DISTINCT FROM OLD.total_amount
    OR NEW.subtotal       IS DISTINCT FROM OLD.subtotal
    OR NEW.paid_amount    IS DISTINCT FROM OLD.paid_amount
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.customer_id    IS DISTINCT FROM OLD.customer_id
    OR NEW.sale_order_id  IS DISTINCT FROM OLD.sale_order_id
  ) THEN
    RAISE EXCEPTION 'so_invoice totals / balance / linkage are maintained by the recompute trigger and invoice RPCs — they cannot be set by a direct client write.'
      USING ERRCODE = '42501';
  END IF;

  -- Only 'void' is a client-settable status transition; everything else is workflow.
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
