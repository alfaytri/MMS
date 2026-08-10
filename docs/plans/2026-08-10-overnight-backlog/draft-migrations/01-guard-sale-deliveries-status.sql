-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_sale_delivery_status.sql + mirror.
-- ============================================================================
-- Security P1 — guard sale_deliveries workflow statuses against direct client
-- writes (mirror of guard_so_privileged_status, 20260819110000).
--
-- Finding (audit ../security-p1-audit.md §5): sale_deliveries is on the baseline
-- "Internal can insert/select/update sale_deliveries" USING(true)/WITH CHECK(true)
-- policy — wide open to any authenticated user, not permission-gated. The client
-- legitimately (a) INSERTs a stub delivery at status='pending' (useConfirmSO,
-- useSaleOrders.ts:852-858) and (b) UPDATEs warehouse_id/warehouse_name/date via
-- useUpdateDelivery (useSaleDeliveries.ts:73-77). But useUpdateDelivery spreads a
-- typed `updates` object whose `status?` is passthrough, and the grant permits it,
-- so `update sale_deliveries set status='delivered'` via raw PostgREST would mark a
-- delivery delivered with NO stock movement / NO COGS, or 'cancelled' with NO
-- inventory reversal.
--
-- Every workflow-status setter is SECURITY DEFINER (verified in audit):
--   complete_delivery_inventory (20260727070000), rpc_complete_delivery_with_followup
--   (20260806170000), cancel_delivery_inventory (20260803001900),
--   create_and_confirm_delivery (20260715180000 / 20260802001000).
-- ⚠ MORNING PRE-CHECK: confirm rpc_create_partial_replacement is SECURITY DEFINER
--   and what status it inserts — if it inserts a non-'pending' delivery it must run
--   as a non-client role (it does, being DEFINER) so this guard lets it pass; verify.
--
-- This BEFORE INS/UPD trigger blocks a DIRECT CLIENT write that sets a workflow-only
-- status, leaving the legit INSERT('pending') + warehouse/date edits untouched.

CREATE OR REPLACE FUNCTION public.guard_sale_delivery_status()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (default): current_user must reflect the real caller.
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'A sale delivery cannot be created with status "%" — the delivery workflow sets that.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('delivered', 'in_progress', 'cancelled') THEN
      RAISE EXCEPTION 'Sale delivery status "%" can only be set by the delivery workflow (complete/cancel RPCs), not a direct update.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sale_delivery_status ON public.sale_deliveries;
CREATE TRIGGER trg_guard_sale_delivery_status
BEFORE INSERT OR UPDATE ON public.sale_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.guard_sale_delivery_status();

-- Defense-in-depth: anon has no legitimate access (authenticated-only app).
REVOKE ALL ON public.sale_deliveries FROM anon;
