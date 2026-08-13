-- Security P1 — narrow lock on so_po_returns RPC-exclusive timestamp columns.
--
-- Finding: so_po_returns' STATUS MACHINE IS ENTIRELY CLIENT-DRIVEN — the client sets
-- status directly (pending/dispatched/received/restocked/closed/cancelled/…) and THEN
-- calls a side-effect RPC. A status-value guard would break the legit flow. The only
-- server-owned columns are dispatched_at + restocked_at, set exclusively by DEFINER
-- RPCs. So this guard is deliberately NARROW: it blocks only a direct client write to
-- dispatched_at / restocked_at (which would let a client fake a dispatch/restock
-- timestamp without the inventory side-effects). The real hardening — moving the
-- status machine into DEFINER RPCs so a status guard becomes possible — is a
-- P0a-style follow-up, NOT this trigger.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * dispatched_at + restocked_at exist.
--  * the only functions that write those columns are DEFINER: rpc_process_po_return_dispatch,
--    rpc_cancel_po_return_dispatch, rpc_process_return_restock (prosecdef=true) → pass the gate.
--  * NO direct client write to dispatched_at / restocked_at (grep src/ — every match is a
--    SELECT/read or a TS type, never a .update()).

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
