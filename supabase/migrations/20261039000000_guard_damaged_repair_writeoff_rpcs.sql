-- 20261039000000_guard_damaged_repair_writeoff_rpcs.sql
--
-- Phase 1 / Task 1 — add server-side permission guards to three RPCs that were
-- executable by ANY authenticated user (guard=N, PostgREST-reachable). Guards
-- match each screen's existing check:
--   rpc_send_damaged_stock_for_repair -> damaged_stock.on_hand.edit
--   rpc_request_damaged_writeoff       -> damaged_stock.on_hand.edit
--   rpc_send_damaged_for_repair        -> damaged_stock.out_for_repair.edit
-- Access-control only; no stock / COGS behavior changes.
--
-- Drift-proof in-place transform, done by POSITION-SPLICE (not regexp_replace
-- replacement, which double-escapes backslashes): find the head up to and
-- including the first body BEGIN (case-insensitive; bodies mix BEGIN/begin) and
-- splice a single-line, dollar-quoted guard right after it. Idempotent (skips if
-- already guarded) and asserts the guard landed or aborts.

DO $do$
DECLARE
  r record; v_def text; v_head text; v_new text; v_guard text; v_needle text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('rpc_send_damaged_stock_for_repair', 'damaged_stock.on_hand.edit'),
      ('rpc_request_damaged_writeoff',      'damaged_stock.on_hand.edit'),
      ('rpc_send_damaged_for_repair',       'damaged_stock.out_for_repair.edit')
    ) AS t(fn, perm)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_def IS NULL THEN RAISE EXCEPTION 'fn % not found', r.fn; END IF;

    v_needle := $q$_auth_user_has_permission('$q$ || r.perm || $q$')$q$;
    IF position(v_needle in v_def) > 0 THEN
      RAISE NOTICE '% already guarded — skip', r.fn; CONTINUE;
    END IF;

    v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
    IF v_head IS NULL THEN RAISE EXCEPTION 'no BEGIN anchor in %', r.fn; END IF;

    v_guard := $q$ IF NOT public._auth_user_has_permission('$q$ || r.perm
      || $q$') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;$q$;

    v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);

    IF position(v_needle in v_new) = 0 THEN
      RAISE EXCEPTION 'guard injection failed for %', r.fn;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'guarded % with %', r.fn, r.perm;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
