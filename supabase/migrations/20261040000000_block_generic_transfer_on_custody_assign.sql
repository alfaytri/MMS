-- 20261040000000_block_generic_transfer_on_custody_assign.sql
--
-- Phase 1 / Task 2 (H4) — the generic transfer RPCs are transfer_kind-blind, so
-- a custody_assign transfer can be dispatched/received via the generic path,
-- skipping the custody-specific accept logic (shortfall disposition +
-- recalc_average_cost). Block ONLY custody_assign on dispatch_transfer and
-- receive_transfer. custody_return stays receivable by the generic receive by
-- design; cancel_transfer / reject_transfer_v2 are left untouched this phase.
--
-- Drift-proof position-splice: inject a self-contained guard (does its own
-- transfer_kind lookup by p_transfer_id) right after the body BEGIN, so it does
-- not depend on the function's internal variables. Idempotent (skips if the
-- marker is already present) and asserts the injection landed or aborts.
-- Case-insensitive BEGIN match. Only custody_assign matches, so good_stock /
-- custody_return / damaged_repair_* kinds all pass through unaffected.

DO $do$
DECLARE
  r text; v_def text; v_head text; v_new text; v_guard text;
  c_marker constant text := 'custody transfers use the custody flow';
BEGIN
  FOREACH r IN ARRAY ARRAY['dispatch_transfer','receive_transfer'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = r;
    IF v_def IS NULL THEN RAISE EXCEPTION 'fn % not found', r; END IF;
    IF position(c_marker in v_def) > 0 THEN
      RAISE NOTICE '% already blocks custody — skip', r; CONTINUE;
    END IF;

    v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
    IF v_head IS NULL THEN RAISE EXCEPTION 'no BEGIN anchor in %', r; END IF;

    v_guard := $q$ IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'custody_assign' THEN RAISE EXCEPTION 'custody transfers use the custody flow (dispatch/accept), not the generic transfer action' USING ERRCODE = '42501'; END IF;$q$;

    v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);
    IF position(c_marker in v_new) = 0 THEN
      RAISE EXCEPTION 'custody-block injection failed for %', r;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'custody-block added to %', r;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
