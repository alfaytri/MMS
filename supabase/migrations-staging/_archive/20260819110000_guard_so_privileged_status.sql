-- Security P1 — guard sale_orders status transitions against direct client writes
-- (mirrors the purchase_orders guard in 20260819060000).
--
-- Finding: sale_orders is under the app-wide division_scope_* RLS, whose UPDATE
-- policy only checks is_division_visible(division_id) — no column/status guard.
-- So any authenticated division member could run
-- `update sale_orders set status='delivered'` (or 'invoiced', 'in_progress',
-- 'closed', 'partial_delivery') directly via PostgREST — marking an order
-- delivered/invoiced with NO stock movement, NO COGS, NO invoice, bypassing the
-- delivery/invoice workflow entirely.
--
-- An existing trigger (_sale_orders_block_bypass_approval) only blocks the single
-- pending_approval -> confirmed transition (forcing it through the approve RPC).
-- This guard closes the rest: it blocks a DIRECT CLIENT write from setting any
-- workflow-only status, while leaving the two legitimate client transitions
-- (confirmed, cancelled) and every SECURITY DEFINER workflow RPC untouched.
--
-- Verified before writing (staging mwvblpgbgxipvrevkeff, 2026-08-09):
--  * sale_orders.status enum: quotation, confirmed, in_progress, delivered,
--    cancelled, pending_approval, partial_delivery, invoiced, closed.
--  * Client sets status directly only to 'confirmed' (useConfirmSO) and
--    'cancelled' (useCancelSO). Creation is via create_sale_order (DEFINER) at
--    status quotation / pending_approval; there is no direct client INSERT.
--  * Every function that sets a workflow status is SECURITY DEFINER
--    (complete_delivery_inventory, apply_sale_order_edit, resubmit_sale_order,
--    advance_sales_approval, reject_sales_request, cancel_delivery_inventory, …)
--    — they run as the owner role, so a current_user-based guard lets them
--    through and blocks only direct PostgREST writes. The one INVOKER writer
--    (sale_order_lines_invalidate_parent_pdf_fn) only nulls the PDF cache (never
--    status) and fires only inside DEFINER context (sale_order_lines is
--    RPC-only after P0b).

CREATE OR REPLACE FUNCTION public.guard_so_privileged_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller. A
-- SECURITY DEFINER trigger would always report the owner role and defeat the
-- direct-vs-RPC distinction below.
SET search_path TO 'public'
AS $$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER workflow RPCs (and the
  -- service role) run as a non-client role and are the only legitimate source of
  -- a workflow status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('quotation', 'pending_approval') THEN
      RAISE EXCEPTION 'A sale order cannot be created with status "%" — that is set by the workflow.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('confirmed', 'cancelled') THEN
      RAISE EXCEPTION 'Sale order status "%" can only be set by the delivery/invoice/approval workflow, not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_so_privileged_status ON public.sale_orders;
CREATE TRIGGER trg_guard_so_privileged_status
BEFORE INSERT OR UPDATE ON public.sale_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_so_privileged_status();

-- Defense-in-depth: anon has no legitimate access to sale_orders (the app is
-- authenticated-only; the division_scope RLS already returns false without a
-- session). Strip its grants. (Idempotent — no-op if already revoked.)
REVOKE ALL ON public.sale_orders FROM anon;
