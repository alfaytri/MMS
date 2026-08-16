-- Batch 2 — money-path CREATE RPCs: enforce the module's .create permission.
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md.
--
-- These are client-called, SECURITY DEFINER, plpgsql RPCs that previously
-- enforced NO permission (DEFINER bypasses RLS), so the "Create X" permissions
-- were cosmetic. The guard is spliced right after the outer BEGIN; the body is
-- preserved byte-for-byte via pg_get_functiondef (only the guard line is added).
-- _auth_user_has_permission reads the CALLER's auth.uid() even inside a DEFINER
-- function, and passes for admins + any holder of .create OR .manage — the roles
-- are already configured with these keys, so no legitimate user regresses.
-- Idempotent (skips already-guarded); aborts if the anchor isn't found.
DO $$
DECLARE
  r record; v_def text; v_new text; v_guard text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('rpc_create_purchase_order(jsonb)',                                                                                    'purchase.orders.create',      'purchase.orders.manage',       'create purchase orders'),
      ('rpc_create_purchase_bill(jsonb)',                                                                                     'purchase.bills.create',       'purchase.bills.manage',        'create bills'),
      ('generate_invoice_from_so(uuid)',                                                                                      'sales.invoices.create',       'sales.invoices.manage',        'create invoices'),
      ('create_sale_order(uuid,text,text,numeric,date,text,text,jsonb,text,text,text,integer,numeric,text,text,jsonb,uuid)', 'sales.orders.create',         'sales.orders.manage',          'create sale orders'),
      ('create_and_approve_receival(uuid,uuid,date,text,text,text,jsonb,uuid)',                                               'purchase.receivals.create',   'purchase.receivals.manage',    'create receivals'),
      ('create_landed_cost(text,date,text,jsonb,uuid[],uuid[])',                                                              'purchase.landed_costs.create','purchase.landed_costs.manage', 'create landed costs'),
      ('create_and_confirm_delivery(uuid,uuid,text,date,jsonb)',                                                              'sales.deliveries.create',     'sales.deliveries.manage',      'create deliveries'),
      ('create_and_confirm_delivery(uuid,uuid,text,date,jsonb,uuid)',                                                         'sales.deliveries.create',     'sales.deliveries.manage',      'create deliveries')
    ) AS t(sig, k1, k2, lbl)
  LOOP
    v_def := pg_get_functiondef(('public.'||r.sig)::regprocedure);
    IF position('_auth_user_has_permission' in v_def) > 0 THEN
      RAISE NOTICE 'skip (already guarded): %', r.sig; CONTINUE;
    END IF;
    v_guard := format('  IF NOT public._auth_user_has_permission(%L) AND NOT public._auth_user_has_permission(%L) THEN RAISE EXCEPTION %L USING ERRCODE = ''42501''; END IF;',
                      r.k1, r.k2, 'Not authorized to '||r.lbl);
    v_new := regexp_replace(v_def, '(\r?\n[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\r?\n)', '\1' || v_guard || chr(10));
    IF v_new = v_def THEN
      RAISE EXCEPTION 'guard injection failed (outer BEGIN not matched) for %', r.sig;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'guarded %', r.sig;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
