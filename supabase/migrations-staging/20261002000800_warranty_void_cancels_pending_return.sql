-- Stage 4 fix (review [Major]): close the void/in_progress double-return hole.
--
-- Bug: rpc_void_warranty_claim only blocked status IN ('resolved','void'), so an
-- in_progress claim (one that already spawned a so_po_returns row via
-- rpc_start_warranty_claim_resolution) could be voided. Voiding releases the
-- claim's qty back to remaining coverage (void is excluded from the remaining
-- SUM), BUT the linked return stayed live and kept flowing through the Returns
-- machinery — so the same physical units were counted twice: freed for a new
-- claim AND still being restocked/refunded/replaced by the original return.
--
-- Fix: when voiding an in_progress claim, look at its linked return:
--   - still 'pending_inspection' (created but untouched — rpc_start only INSERTs
--     the return + lines, no inventory/ledger movement yet) → cancel it as part
--     of the void (safe: nothing to reverse), then void the claim. Coverage is
--     correctly released because there is no longer a live return.
--   - anything else (inspection done / dispositioned / resolved) → BLOCK the
--     void; the operator must resolve or complete that return instead. This keeps
--     remaining_qty an honest ledger.
--
-- Rejected claims can never be in_progress (reject only comes from 'open', before
-- any return exists), so the release-on-rejected rule needs no equivalent guard.
--
-- Live-verified (2026-08-22, staging): so_po_returns has no status-transition
-- trigger that blocks pending_inspection->cancelled; guard_so_po_returns_rpc_
-- timestamps only protects dispatched_at/restocked_at and short-circuits for
-- non-authenticated/anon (SECDEF) callers; 'cancelled' is a valid return_status;
-- _sync_warranty_claim_from_return ignores 'cancelled' (not a terminal resolution).

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_void_warranty_claim(p_claim_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_profile       uuid;
  v_status        warranty_claim_status;
  v_return_id     uuid;
  v_return_status return_status;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A void reason is required'; END IF;

  SELECT status, linked_return_id INTO v_status, v_return_id
    FROM warranty_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF v_status IN ('resolved','void') THEN RAISE EXCEPTION 'Claim is already %', v_status USING ERRCODE='42501'; END IF;

  -- in_progress claim: reconcile its linked return so voiding can't orphan a live
  -- return (which would double-count the units against released coverage).
  IF v_status = 'in_progress' AND v_return_id IS NOT NULL THEN
    SELECT status INTO v_return_status FROM so_po_returns WHERE id = v_return_id FOR UPDATE;
    IF v_return_status IS DISTINCT FROM 'pending_inspection' THEN
      RAISE EXCEPTION 'This claim''s return has already been processed (status: %). Resolve or complete that return instead of voiding the claim.', v_return_status
        USING ERRCODE='42501';
    END IF;
    UPDATE so_po_returns SET status = 'cancelled', updated_at = now() WHERE id = v_return_id;
  END IF;

  UPDATE warranty_claims
    SET status = 'void', void_reason = btrim(p_reason), voided_by = v_profile, voided_at = now(), updated_at = now()
    WHERE id = p_claim_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
