-- Batch 6 — gate the 4 DEFERRED DEFINER RPCs left open after Batch 5.
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md (§ Batch 6) and
-- docs/security/2026-08-16-permission-audit.md (§F/§G). Final piece of the
-- RPC permission-hardening effort.
--
-- These were deferred because no non-admin role held a matching key (guarding
-- blindly would surprise-break a live flow). Resolution (operator-decided
-- 2026-08-16): the matching keys ALREADY EXIST in the catalog — just gate each
-- RPC on its natural key; the operator assigns the keys to roles in the role
-- editor. Admins always bypass (_auth_user_has_permission returns true for
-- is_system_admin). No grants are made here.
--
--   1. create_service_customer(text,text,text)   → master_data.service_customers.create
--      (no frontend caller; Data-API-only surface — gate closes the hole)
--   2. upsert_package_with_services(jsonb,jsonb)  → master_data.services.manage
--      (no frontend caller; Data-API-only surface)
--   3. rpc_cancel_consumption(uuid)               → consumption.cancel
--      (LIVE — src/hooks/useConsumption.ts; reverses posted stock + COGS.
--       Operator chose Owner/admins-only for now → gate on consumption.cancel,
--       which no role holds, so only admins pass until the key is granted.)
--   4. rpc_create_custody_return(...)             → NO CHANGE (Pattern C).
--      Already gated in-body: only the source sub-container's responsible person
--      may return (raises "Only <name> can return stock from this custody
--      sub-container"). Documented, not migrated.
--
-- Guard is spliced right after the outer BEGIN; the body is preserved
-- byte-for-byte via pg_get_functiondef (only the guard line is added).
-- Idempotent (skips already-guarded); aborts if the anchor isn't found.
-- Injector mirrors 20260906000000_perm_harden_batch2_creates.sql (single-key).
DO $$
DECLARE
  r record; v_def text; v_new text; v_guard text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('create_service_customer(text,text,text)',   'master_data.service_customers.create', 'create service customers'),
      ('upsert_package_with_services(jsonb,jsonb)',  'master_data.services.manage',          'manage service packages'),
      ('rpc_cancel_consumption(uuid)',               'consumption.cancel',                   'cancel a consumption')
    ) AS t(sig, k, lbl)
  LOOP
    v_def := pg_get_functiondef(('public.'||r.sig)::regprocedure);
    IF position('_auth_user_has_permission' in v_def) > 0 THEN
      RAISE NOTICE 'skip (already guarded): %', r.sig; CONTINUE;
    END IF;
    v_guard := format('  IF NOT public._auth_user_has_permission(%L) THEN RAISE EXCEPTION %L USING ERRCODE = ''42501''; END IF;',
                      r.k, 'Not authorized to '||r.lbl);
    v_new := regexp_replace(v_def, '(\r?\n[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\r?\n)', '\1' || v_guard || chr(10));
    IF v_new = v_def THEN
      RAISE EXCEPTION 'guard injection failed (outer BEGIN not matched) for %', r.sig;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'guarded %', r.sig;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
