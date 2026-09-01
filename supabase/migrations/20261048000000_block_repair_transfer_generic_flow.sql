-- 20261048000000_block_repair_transfer_generic_flow.sql  (Phase 3/4 security follow-up)
--
-- Close the analog of the custody bypass (migration 20261040): a
-- 'damaged_repair_out' transfer (tool OR damaged-stock repair) must be completed
-- through its dedicated flow — rpc_return_tool_from_repair (tools) or
-- rpc_return_damaged_from_repair (damaged stock) — NOT the generic
-- dispatch_transfer / receive_transfer, which skip the repair-specific logic
-- (tool status + gated scrap; damaged-pile accounting). Both dedicated return
-- RPCs complete the transfer with a DIRECT status update (verified: neither
-- calls receive_transfer), so this guard does not affect them. Repair transfers
-- are created already in_transit, so the dispatch guard is purely defensive.
--
-- Drift-proof: inject the guard right after the function's BEGIN on the LIVE body
-- (case-insensitive — bodies mix BEGIN/begin), idempotent (skip if already
-- present), assert-or-abort. Mirrors the 20261040 custody-guard technique.

DO $do$
DECLARE
  r record; v_def text; v_head text; v_new text;
  v_guard constant text :=
    $g$ IF (SELECT transfer_kind FROM public.warehouse_transfers WHERE id = p_transfer_id) = 'damaged_repair_out' THEN RAISE EXCEPTION 'repair transfers use the Send / Return-from-repair flow, not the generic transfer action' USING ERRCODE = '42501'; END IF;$g$;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('dispatch_transfer','receive_transfer')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('damaged_repair_out' in v_def) > 0 THEN
      RAISE NOTICE '% already guards damaged_repair_out — skip', r.proname;
      CONTINUE;
    END IF;

    v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
    IF v_head IS NULL THEN
      RAISE EXCEPTION 'could not locate BEGIN in % body', r.proname;
    END IF;
    v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);

    IF v_new = v_def OR position('damaged_repair_out' in v_new) = 0 THEN
      RAISE EXCEPTION 'damaged_repair_out guard injection failed for %', r.proname;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE '% : damaged_repair_out guard added', r.proname;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
