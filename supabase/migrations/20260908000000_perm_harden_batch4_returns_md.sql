-- Batch 4 — returns / credit-notes / master-data RPCs: enforce permissions.
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md.
--
-- Client-called, SECURITY DEFINER, plpgsql, previously ungated. Guard spliced
-- after the outer BEGIN (body preserved via pg_get_functiondef). Multi-key OR so
-- the coarse guard blocks users with NO relevant permission without regressing
-- the roles that already hold one (verified on new-prod): returns roles hold
-- returns.create/manage; Sales User holds credit_notes.view (redeem stays coarse
-- to keep it working); Inventory/Warehouse hold damaged_stock.out_for_repair.edit;
-- customers/catalog/pricing keys are held by the creating roles; admins bypass.
--
-- DEFERRED (no role holds the key today → guarding would make them admin-only and
-- could surprise-break a flow): create_service_customer, upsert_package_with_services,
-- rpc_cancel_consumption; plus rpc_create_custody_return (custody RP-gating to be
-- verified). Those need a role-grant/gating decision first — see the plan doc.
DO $$
DECLARE r record; v_def text; v_new text; v_guard text; v_or text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('rpc_record_return_refund(uuid,jsonb,text,text)',                     ARRAY['sales.returns.create','sales.returns.manage','purchase.returns.create','purchase.returns.manage'], 'process return refunds'),
      ('rpc_record_return_store_credit(uuid,jsonb)',                         ARRAY['sales.returns.create','sales.returns.manage'],                                                     'record return store credit'),
      ('rpc_process_return_restock(uuid)',                                   ARRAY['sales.returns.create','sales.returns.manage','purchase.returns.create','purchase.returns.manage'], 'restock returns'),
      ('rpc_close_return(uuid,text)',                                        ARRAY['sales.returns.create','sales.returns.manage','purchase.returns.create','purchase.returns.manage'], 'close returns'),
      ('rpc_complete_return_inspection(uuid,jsonb,uuid)',                    ARRAY['sales.returns.create','sales.returns.manage','purchase.returns.create','purchase.returns.manage'], 'complete return inspection'),
      ('rpc_create_partial_replacement(uuid,uuid,jsonb,jsonb,jsonb)',        ARRAY['sales.returns.create','sales.returns.manage'],                                                     'create replacements'),
      ('rpc_process_po_return_dispatch(uuid)',                              ARRAY['purchase.returns.create','purchase.returns.manage'],                                               'dispatch PO returns'),
      ('rpc_cancel_po_return_dispatch(uuid)',                               ARRAY['purchase.returns.create','purchase.returns.manage'],                                               'cancel PO return dispatch'),
      ('rpc_redeem_credit_note(uuid,uuid,numeric,text,text,text,date,text,uuid)', ARRAY['sales.credit_notes.view','sales.credit_notes.create','sales.credit_notes.manage'],           'redeem credit notes'),
      ('rpc_return_damaged_from_repair(uuid,text,numeric,numeric,numeric,text)', ARRAY['damaged_stock.out_for_repair.edit'],                                                          'return damaged stock from repair'),
      ('create_customer_with_phone(text,text,text)',                         ARRAY['master_data.customers.create','master_data.customers.manage'],                                     'create customers'),
      ('create_tool_item_with_default_variant(text,text,uuid)',             ARRAY['inventory.catalog.manage'],                                                                        'create tool items'),
      ('batch_update_variant_prices(jsonb)',                                 ARRAY['inventory.pricing.manage','inventory.catalog.manage'],                                             'update prices'),
      ('service_inventory_bulk_upsert(uuid[],uuid,text,numeric,integer)',    ARRAY['inventory.catalog.manage'],                                                                        'bulk-update inventory')
    ) AS t(sig, keys, lbl)
  LOOP
    v_def := pg_get_functiondef(('public.'||r.sig)::regprocedure);
    IF position('_auth_user_has_permission' in v_def) > 0 THEN
      RAISE NOTICE 'skip (already guarded): %', r.sig; CONTINUE;
    END IF;
    SELECT string_agg(format('public._auth_user_has_permission(%L)', k), ' OR ') INTO v_or FROM unnest(r.keys) k;
    v_guard := format('  IF NOT (%s) THEN RAISE EXCEPTION %L USING ERRCODE = ''42501''; END IF;', v_or, 'Not authorized to '||r.lbl);
    v_new := regexp_replace(v_def, '(\r?\n[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\r?\n)', '\1' || v_guard || chr(10));
    IF v_new = v_def THEN
      RAISE EXCEPTION 'guard injection failed (outer BEGIN not matched) for %', r.sig;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'guarded %', r.sig;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
