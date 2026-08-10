-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_guard_so_po_returns_rpc_timestamps.sql + mirror.
-- ============================================================================
-- Security P1 — narrow lock on so_po_returns RPC-exclusive timestamp columns.
--
-- Finding (audit ../security-p1-audit.md §6): so_po_returns' STATUS MACHINE IS
-- ENTIRELY CLIENT-DRIVEN — the client sets status directly (pending / dispatched /
-- received / restocked / closed / cancelled / supplier_confirmed) and THEN calls a
-- side-effect RPC (usePurchaseReturns.ts:448/457/476/480, useSaleReturns.ts:429/639).
-- A status-value guard like the SO/delivery one WOULD BREAK the legit flow. The only
-- server-owned columns are dispatched_at and restocked_at, set exclusively by the
-- DEFINER RPCs rpc_process_po_return_dispatch (20260806170000:153) and
-- rpc_process_return_restock (20260728000000:45). rpc_complete_return_inspection sets
-- status='received' + restock_warehouse_id (DEFINER, passes the current_user gate).
--
-- So this guard is deliberately NARROW: it only blocks a direct client write to
-- dispatched_at / restocked_at (which would let a client fake a dispatch/restock
-- timestamp without the inventory side-effects). The real hardening — moving the
-- status machine into DEFINER RPCs so a status guard becomes possible — is a
-- P0a-style follow-up, NOT this trigger.

CREATE OR REPLACE FUNCTION public.guard_so_po_returns_rpc_timestamps()
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
       NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    OR NEW.restocked_at  IS DISTINCT FROM OLD.restocked_at
  ) THEN
    RAISE EXCEPTION 'so_po_returns.dispatched_at / restocked_at are set only by the dispatch / restock RPCs, not by a direct client write.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_so_po_returns_rpc_timestamps ON public.so_po_returns;
CREATE TRIGGER trg_guard_so_po_returns_rpc_timestamps
BEFORE UPDATE ON public.so_po_returns
FOR EACH ROW
EXECUTE FUNCTION public.guard_so_po_returns_rpc_timestamps();

REVOKE ALL ON public.so_po_returns FROM anon;
