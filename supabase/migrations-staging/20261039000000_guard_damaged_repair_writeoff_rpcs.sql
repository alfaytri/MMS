-- 20261039000000_guard_damaged_repair_writeoff_rpcs.sql
--
-- Phase 1 / Task 1 — add server-side permission guards to three RPCs that were
-- executable by ANY authenticated user (guard=N, PostgREST-reachable). Guards
-- match each screen's existing check:
--   rpc_send_damaged_stock_for_repair -> damaged_stock.on_hand.edit
--   rpc_request_damaged_writeoff       -> damaged_stock.on_hand.edit
--   rpc_send_damaged_for_repair        -> damaged_stock.out_for_repair.edit
-- Access-control only; no stock / COGS behavior changes. Drift-proof in-place
-- transform: idempotent (skips if already guarded) and asserts the injection
-- landed or aborts. Function bodies mix BEGIN/begin, so the anchor is matched
-- case-insensitively ('i').

DO $do$
DECLARE
  r record; v_def text; v_new text;
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

    IF v_def ~ ('_auth_user_has_permission\('''||r.perm||'''\)') THEN
      RAISE NOTICE '% already guarded — skip', r.fn; CONTINUE;
    END IF;

    v_new := regexp_replace(
      v_def,
      '(\$function\$.*?\mBEGIN\M)',
      E'\\1\n  IF NOT public._auth_user_has_permission('''||r.perm||''') THEN\n'
      || E'    RAISE EXCEPTION ''not authorized'' USING ERRCODE = ''42501'';\n'
      || E'  END IF;',
      'i');
    IF v_new = v_def OR v_new !~ ('_auth_user_has_permission\('''||r.perm||'''\)') THEN
      RAISE EXCEPTION 'guard injection failed for %', r.fn;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'guarded % with %', r.fn, r.perm;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
