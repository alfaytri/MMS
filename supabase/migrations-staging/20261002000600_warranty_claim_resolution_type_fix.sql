-- Stage 3 Task 4 follow-up: correct _sync_warranty_claim_from_return's
-- resolution_type mapping. Plan: docs/plans/2026-08-21-warranty-completion/03-claims.md
--
-- Review finding (Task C reviewer, CHANGES REQUESTED) + controller live
-- investigation (2026-08-21, staging mwvblpgbgxipvrevkeff):
--
--   The original trigger (migration 20261002000500) had a `WHEN v_has_repair
--   THEN 'repair'` arm. Live tracing of the returns module proved that arm is
--   both misleading and unreachable-as-intended:
--
--   1. "Repair" is NOT a customer resolution. return_line_customer_resolutions
--      .resolution_type CHECK is exactly ('refund','replacement','store_credit')
--      — there is no 'repair'. `rpc_send_damaged_for_repair` writes ONLY to
--      return_line_inventory_dispositions + a warehouse_transfer
--      (transfer_kind='damaged_repair_out') that ships the physical unit to a
--      repair vendor's virtual warehouse. It records no customer-facing
--      outcome and does not close the return.
--
--   2. A return only reaches a terminal status via `_maybe_close_return`,
--      whose first gate is `customer_remaining = 0`, and customer_remaining
--      (view return_progress / return_line_progress) is driven SOLELY by
--      return_line_customer_resolutions. So by the time this AFTER UPDATE
--      trigger fires (NEW.status terminal), every line already carries a
--      refund / replacement / store_credit resolution. A send-for-repair
--      disposition alone can never drive customer_remaining to 0, so it never
--      makes the return terminal on its own — exactly like any other return,
--      which stays open until a customer resolution is recorded. That is the
--      returns module's own behaviour (Approach B: one source of truth — we do
--      NOT modify _maybe_close_return / return_line_progress here).
--
--   Consequently the 'repair' arm could only ever fire for a MIXED
--   (resolved_partial) return that ALSO happened to have a repair disposition,
--   where it would MISLABEL a mixed customer outcome as 'repair'. Removing it:
--   resolution_type now maps only to the actual customer outcome
--   (replacement / refund / credit), or NULL for a genuinely mixed/partial
--   return (the warranty_claims.resolution_type CHECK permits NULL — a CHECK
--   only rejects FALSE, not NULL — and the operator sees the full breakdown on
--   the linked return).
--
--   "Repair" as a *customer* warranty outcome (repair the customer's item and
--   return it to them) is a service/contract-warranty concept, which the
--   operator explicitly deferred to a later phase. The
--   warranty_claims.resolution_type CHECK keeps 'repair' as a permitted value
--   for that future workflow; this sale-claim trigger simply never sets it.
--
-- Also in this commit: the docs/flows-registry.md "Warranty Claim (sale)"
-- entry (plan Task 4 Step 5 + AGENTS.md Flow Registry rule: register the flow
-- in the same commit that ships the code).

BEGIN;

CREATE OR REPLACE FUNCTION public._sync_warranty_claim_from_return()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_all_replacement  boolean;
  v_all_store_credit boolean;
  v_all_refund       boolean;
  v_resolution_type  text;
BEGIN
  IF NEW.status NOT IN ('resolved_credit','resolved_replacement','resolved_partial') THEN
    RETURN NEW;
  END IF;

  -- Only a claim still awaiting resolution gets flipped; this also makes
  -- the trigger idempotent against later, unrelated updates to an
  -- already-resolved return (status stays terminal, claim stays resolved).
  IF NOT EXISTS (
    SELECT 1 FROM warranty_claims WHERE id = NEW.warranty_claim_id AND status = 'in_progress'
  ) THEN
    RETURN NEW;
  END IF;

  -- Mirror _maybe_close_return's own finer decomposition of the customer
  -- ledger (per-line resolution_type), since warranty_claims.resolution_type
  -- needs refund vs credit distinguished (the coarser resolved_credit status
  -- conflates them). resolution_type is the CUSTOMER outcome only; repair is
  -- an inventory disposition, not a customer resolution (see header).
  SELECT
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  INTO v_all_replacement, v_all_store_credit, v_all_refund
  FROM return_line_customer_resolutions cr
  JOIN return_lines rl ON rl.id = cr.return_line_id
  WHERE rl.return_id = NEW.id;

  v_resolution_type := CASE
    WHEN v_all_replacement  THEN 'replacement'
    WHEN v_all_refund       THEN 'refund'
    WHEN v_all_store_credit THEN 'credit'
    ELSE NULL              -- mixed / partial: no single customer outcome
  END;

  UPDATE warranty_claims
    SET status = 'resolved',
        resolved_at = now(),
        linked_credit_note_id = NEW.credit_note_id,
        resolution_type = v_resolution_type,
        updated_at = now()
    WHERE id = NEW.warranty_claim_id;

  RETURN NEW;
END;
$fn$;

-- Trigger definition unchanged (function body swap only); re-assert for safety.
DROP TRIGGER IF EXISTS trg_sync_warranty_claim_from_return ON public.so_po_returns;
CREATE TRIGGER trg_sync_warranty_claim_from_return
AFTER UPDATE ON public.so_po_returns FOR EACH ROW
WHEN (NEW.warranty_claim_id IS NOT NULL)
EXECUTE FUNCTION public._sync_warranty_claim_from_return();

NOTIFY pgrst, 'reload schema';
COMMIT;
