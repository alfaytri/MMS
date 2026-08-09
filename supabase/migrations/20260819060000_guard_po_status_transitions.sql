-- Guard PO status transitions against direct client writes (security — closes
-- the approval-bypass part of finding "B").
--
-- Finding (live-confirmed 2026-08-09): `purchase_orders` grants authenticated
-- (and anon) full CRUD incl. UPDATE, and its RLS `division_scope_update` policy
-- only checks is_division_visible(division_id) with no column/status guard. So
-- any division member could run `update purchase_orders set status='approved'`
-- (or INSERT a PO already `approved`) directly — bypassing the whole approval
-- workflow (no role, no RPC, no approval steps). See project_po_approval_security.
--
-- Verified before writing:
--  * The client only ever sets status to 'draft' | 'pending_approval' |
--    'cancelled' (submit / resubmit / amend-to-pending / withdraw / send-to-draft).
--  * Every function that sets a privileged status (approved / partially_received
--    / received / completed) is SECURITY DEFINER: po_approval_action,
--    advance_po_approval_tier, refresh_po_status. Those run as the table-owner
--    role, so a current_user-based guard lets them through and blocks only
--    direct PostgREST writes (which run as `authenticated`/`anon`).
--
-- This trigger therefore blocks a direct client write from setting a privileged
-- status, while leaving every legitimate client transition (incl. amending an
-- already-approved PO back to 'pending_approval') and every SECURITY DEFINER
-- RPC untouched.
--
-- NOT closed here (separate, larger work — see the "Fix PO status change authz"
-- follow-up): the broad `division_scope_*` pattern still lets a division member
-- edit non-status PO fields (amounts, supplier, …) and likely repeats on other
-- tables; and finding "A" (direct INSERT/DELETE on po_approvals) needs the
-- po_approvals writes routed through a SECURITY DEFINER RPC. Both require design
-- + a repo-wide audit and are handled separately.

CREATE OR REPLACE FUNCTION public.guard_po_privileged_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller.
-- A SECURITY DEFINER trigger would always report the owner role and defeat the
-- direct-vs-RPC distinction below.
SET search_path TO 'public'
AS $$
BEGIN
  -- Only guard direct client writes. SECURITY DEFINER RPCs (and the service
  -- role) run as a non-client role and are the only legitimate source of a
  -- privileged status.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_approval') THEN
      RAISE EXCEPTION 'A purchase order cannot be created with status "%" — that is set by the approval/receival workflow.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('draft', 'pending_approval', 'cancelled') THEN
      RAISE EXCEPTION 'PO status "%" can only be set by the approval/receival workflow, not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_privileged_status ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_privileged_status
BEFORE INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_po_privileged_status();

-- Defense-in-depth: anon never legitimately touches purchase_orders (the app is
-- authenticated-only; anon is already blocked by the division_scope RLS, whose
-- is_division_visible() returns false without a session). Strip its grants.
REVOKE ALL ON public.purchase_orders FROM anon;
