-- Stage 3 Task 4: start-resolution RPC (creates the warranty return) + claim
-- status-sync trigger. Plan: docs/plans/2026-08-21-warranty-completion/03-claims.md
-- "Task 4: Start-resolution RPC (creates the warranty return) + claim
-- status-sync trigger".
--
-- Filename: assigned directly as 20261002000500 (000400 is Task 3's
-- rpc_file/assess/void_warranty_claim migration, already applied) — no
-- collision, next free slot.
--
-- Live-verified before writing (2026-08-21, staging mwvblpgbgxipvrevkeff via
-- `supabase db query --linked`). Several deliberate deviations from the
-- plan's draft SQL, each because the live shape is richer/different from
-- what the plan sketched:
--
--   1. return_number generation (src/hooks/useSaleReturns.ts, useCreateSaleReturn,
--      ~lines 220-225): the hook does a client-side
--      `count(source_type='sale_order') + 1` then `'SR-' || pad(...,5,'0')`
--      — NOT a DB sequence/function, NOT per-division. Replicated verbatim
--      here (same filter, same prefix, same padding), but wrapped in
--      `pg_advisory_xact_lock(hashtext('so_po_returns_return_number'))`
--      first — the client version is racy (two concurrent inserts can both
--      read the same count), and now that this logic runs server-side we
--      can close that race for free, per the task's explicit instruction to
--      make the equivalent "server-side safe". Behaviourally identical
--      numbers, just collision-safe.
--
--   2. `_return_resolution_status(p_return_id uuid)` RETURNS `return_status`
--      (the SAME enum as so_po_returns.status: resolved_credit /
--      resolved_replacement / resolved_partial / NULL), computed from
--      `return_line_customer_resolutions.resolution_type` (refund /
--      replacement / store_credit). Its output alone can't drive
--      warranty_claims.resolution_type because 'resolved_credit' conflates
--      refund and store_credit, but the claim column needs to distinguish
--      'refund' vs 'credit' (CHECK IN ('replacement','credit','refund','repair')).
--      So the trigger below mirrors `_maybe_close_return`'s own finer
--      decomposition (bool_and over return_line_customer_resolutions per
--      resolution_type) directly, joined against return_lines for this
--      return, rather than calling `_return_resolution_status` itself. It
--      still uses NEW.status (which is exactly what `_maybe_close_return`
--      computed via `_return_resolution_status` and wrote to the row) as the
--      terminal-detection gate — so Step 1's function is very much "used",
--      just not re-invoked a second time when a cheaper/finer live query
--      does the same underlying join with more resolution.
--   Terminal statuses: confirmed live `return_status` enum has 11 labels
--      (pending, pending_inspection, received, restocked, closed,
--      dispatched, supplier_confirmed, cancelled, resolved_credit,
--      resolved_replacement, resolved_partial). `_maybe_close_return`'s own
--      NOT-IN guard treats exactly ('cancelled','resolved_credit',
--      'resolved_replacement','resolved_partial') as already-final; of
--      those, 'cancelled' is an abort (not a resolution — the plan asks for
--      "terminal resolution") and 'closed' is written by no live function
--      (legacy/unused). So the claim-resolving terminal set here is
--      exactly ('resolved_credit','resolved_replacement','resolved_partial'),
--      matching `_maybe_close_return`'s own canonical notion of "done"
--      minus the non-resolution 'cancelled' abort path. A cancelled return
--      leaves its claim at 'in_progress' rather than falsely flipping to
--      'resolved'.
--
--   3. Repair signal: `return_line_inventory_dispositions.disposition_type`
--      CHECK is `('write_off','restock_as_damaged','send_for_repair')` —
--      the live label is `'send_for_repair'`, not the plan's shorthand
--      "repair". The trigger checks for that exact literal.
--
--   4. `source_delivery_id`: confirmed the hook's own INSERT payload never
--      sets this column (so_po_returns.source_delivery_id sits NULL on
--      every hook-created return today). A warranty claim, unlike a general
--      multi-line SO return, traces to exactly one sale_delivery_line, so
--      the RPC resolves and populates it (via
--      sale_delivery_lines.sale_delivery_id) — a deliberate enhancement the
--      task explicitly asks for, not a hook-fidelity gap.
--
--   5. `division_id`: confirmed live — so_po_returns.division_id is
--      nullable and no BEFORE INSERT trigger back-fills it (only two
--      BEFORE UPDATE triggers exist on the table: `set_updated_at` and the
--      dispatched_at/restocked_at guard). The hook leaves it NULL; this RPC
--      sets it explicitly from the claim's division_id, per the task's
--      explicit instruction.
--
--   6. return_lines.condition (text, no CHECK constraint on this column) is
--      set to 'inspection' and the return's initial status to
--      'pending_inspection' — mirroring the hook's own
--      `hasInspection ? 'pending_inspection' : 'pending'` branch. A
--      warranty item's physical good/damaged condition is unknown until
--      the operator inspects it, matching the architecture note ("rides the
--      existing inspection -> restock -> ..." flow) and letting the
--      existing rpc_complete_return_inspection own that split.
--
--   7. `_user_has_permission(p_profile_id uuid, p_permission text)` called
--      with named parameters, matching the exact live signature and the
--      style already shipped in rpc_file/assess/void_warranty_claim.
--
--   8. Confirmed via pg_get_functiondef that rpc_file/assess/void_warranty_claim
--      (already live) use `SELECT id INTO v_profile FROM user_data WHERE
--      auth_user_id = auth.uid();` then the permission check — this RPC
--      follows the identical pattern (extended to also grab full_name for
--      created_by_name, matching the hook's own profile lookup).
--
--   9. The trigger function omits REVOKE/GRANT EXECUTE: functions RETURNS
--      trigger cannot be invoked directly via SQL/RPC (Postgres rejects
--      "trigger functions can only be called as triggers"), so there is no
--      grantee to harden against; the orchestrating task's REVOKE/GRANT
--      instruction was scoped to the RPC only, and the DDL block below is
--      attached verbatim as specified.
--
-- Not built (out of scope, per plan + orchestrator): service/contract
-- resolution (guarded off with ERRCODE 0A000); flows-registry.md update
-- (explicitly deferred — this commit is migration-only per instruction).

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_start_warranty_claim_resolution(p_claim_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_profile      uuid;
  v_profile_name text;
  v_claim        RECORD;
  v_rec          RECORD;
  v_delivery_id  uuid;
  v_return_number text;
  v_return_id     uuid;
BEGIN
  SELECT id, full_name INTO v_profile, v_profile_name FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;

  SELECT id, claim_number, status, warranty_type, warranty_record_id, division_id
    INTO v_claim
    FROM warranty_claims
    WHERE id = p_claim_id
    FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_claim.warranty_type <> 'sale' THEN
    RAISE EXCEPTION 'service/contract warranty resolution is not built yet' USING ERRCODE='0A000';
  END IF;
  IF v_claim.status <> 'covered' THEN
    RAISE EXCEPTION 'Only a covered claim can start resolution (status: %)', v_claim.status USING ERRCODE='42501';
  END IF;

  SELECT id, sale_order_id, sale_delivery_line_id, brand_variant_id, item_name, sku, qty
    INTO v_rec
    FROM warranty_records
    WHERE id = v_claim.warranty_record_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

  SELECT sale_delivery_id INTO v_delivery_id
    FROM sale_delivery_lines
    WHERE id = v_rec.sale_delivery_line_id;

  -- Replicate useCreateSaleReturn's return-number scheme (count of existing
  -- source_type='sale_order' returns + 1 -> 'SR-#####'), serialized with an
  -- advisory lock since this now runs server-side and must not race.
  PERFORM pg_advisory_xact_lock(hashtext('so_po_returns_return_number'));
  SELECT 'SR-' || lpad((count(*) + 1)::text, 5, '0')
    INTO v_return_number
    FROM so_po_returns
    WHERE source_type = 'sale_order';

  INSERT INTO so_po_returns (
    return_number, source_type, source_id, source_delivery_id,
    reason, status, division_id, warranty_claim_id,
    created_by, created_by_name
  ) VALUES (
    v_return_number, 'sale_order', v_rec.sale_order_id, v_delivery_id,
    'Warranty claim ' || v_claim.claim_number, 'pending_inspection', v_claim.division_id, p_claim_id,
    v_profile, v_profile_name
  )
  RETURNING id INTO v_return_id;

  INSERT INTO return_lines (
    return_id, brand_variant_id, item_name, sku, qty, condition, sale_delivery_line_id
  ) VALUES (
    v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_rec.qty, 'inspection', v_rec.sale_delivery_line_id
  );

  UPDATE warranty_claims
    SET status = 'in_progress', linked_return_id = v_return_id, updated_at = now()
    WHERE id = p_claim_id;

  RETURN v_return_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_start_warranty_claim_resolution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_warranty_claim_resolution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._sync_warranty_claim_from_return()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_all_replacement  boolean;
  v_all_store_credit boolean;
  v_all_refund       boolean;
  v_has_repair       boolean;
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
  -- ledger (per-line resolution_type), rather than the coarser
  -- resolved_credit/resolved_replacement/resolved_partial status alone,
  -- since warranty_claims.resolution_type needs refund vs credit
  -- distinguished.
  SELECT
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  INTO v_all_replacement, v_all_store_credit, v_all_refund
  FROM return_line_customer_resolutions cr
  JOIN return_lines rl ON rl.id = cr.return_line_id
  WHERE rl.return_id = NEW.id;

  SELECT EXISTS (
    SELECT 1 FROM return_line_inventory_dispositions d
    JOIN return_lines rl ON rl.id = d.return_line_id
    WHERE rl.return_id = NEW.id AND d.disposition_type = 'send_for_repair'
  ) INTO v_has_repair;

  v_resolution_type := CASE
    WHEN v_all_replacement  THEN 'replacement'
    WHEN v_all_refund       THEN 'refund'
    WHEN v_all_store_credit THEN 'credit'
    WHEN v_has_repair       THEN 'repair'
    ELSE NULL
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

DROP TRIGGER IF EXISTS trg_sync_warranty_claim_from_return ON public.so_po_returns;
CREATE TRIGGER trg_sync_warranty_claim_from_return
AFTER UPDATE ON public.so_po_returns FOR EACH ROW
WHEN (NEW.warranty_claim_id IS NOT NULL)
EXECUTE FUNCTION public._sync_warranty_claim_from_return();

NOTIFY pgrst, 'reload schema';
COMMIT;
