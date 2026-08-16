-- Batch 3 — warehouse/transfer/check + approval-config + RP RPCs: enforce perms.
-- Per docs/security/2026-08-16-rpc-permission-hardening-plan.md.
--
-- Client-called, SECURITY DEFINER, plpgsql, previously ungated. Guard spliced
-- after the outer BEGIN (body preserved via pg_get_functiondef). Admins bypass;
-- the roles already hold these keys (transfer.*, check.*, adjustment.request),
-- and approval-config + RP assignment are admin/manage-only in the UI, so no
-- legitimate user regresses. Idempotent; aborts if the anchor isn't found.
DO $$
DECLARE
  r record; v_def text; v_new text; v_guard text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('create_transfer_v2(uuid,uuid,date,jsonb,text,uuid,text,uuid,uuid)',                              'warehouse.transfer.create',      NULL,                          'create transfers'),
      ('dispatch_transfer(uuid,uuid,text)',                                                              'warehouse.transfer.dispatch',    NULL,                          'dispatch transfers'),
      ('receive_transfer(uuid,uuid,text,jsonb)',                                                         'warehouse.transfer.receive',     NULL,                          'receive transfers'),
      ('cancel_transfer(uuid,uuid,text)',                                                                'warehouse.transfer.create',      'warehouse.transfer.approve',  'cancel transfers'),
      ('reject_transfer_v2(uuid,uuid,text)',                                                             'warehouse.transfer.receive',     'warehouse.transfer.approve',  'reject transfers'),
      ('create_stock_adjustment_v2(uuid,uuid,text,numeric,text,text,text[],uuid,text,uuid)',             'warehouse.adjustment.request',   NULL,                          'create stock adjustments'),
      ('save_inventory_check_item_count(uuid,numeric,text,uuid,uuid,text)',                              'warehouse.check.count',          NULL,                          'count inventory checks'),
      ('snapshot_inventory_check_system_qty(uuid)',                                                      'warehouse.check.create',         NULL,                          'start inventory checks'),
      ('apply_inventory_check_adjustments(uuid)',                                                        'warehouse.check.create',         NULL,                          'apply inventory checks'),
      ('add_workflow_step(text,text,boolean,text[])',                                                    'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('add_workflow_step(text,text,text,boolean,text[],uuid)',                                          'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('add_workflow_step_for_role(text,uuid,boolean,text[])',                                           'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('add_workflow_step_for_role(text,uuid,boolean,text[],uuid)',                                      'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('update_workflow_step_role(uuid,uuid)',                                                           'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('update_workflow_step_conditions(uuid,boolean,text[])',                                           'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('archive_workflow_step(uuid,uuid)',                                                               'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('toggle_workflow_step(uuid,boolean)',                                                             'purchase.approvals.chain.manage',NULL,                          'edit approval workflows'),
      ('replace_warehouse_responsible_persons(uuid,uuid[])',                                             'master_data.warehouses.manage',  NULL,                          'assign warehouse responsible persons')
    ) AS t(sig, k1, k2, lbl)
  LOOP
    v_def := pg_get_functiondef(('public.'||r.sig)::regprocedure);
    IF position('_auth_user_has_permission' in v_def) > 0 THEN
      RAISE NOTICE 'skip (already guarded): %', r.sig; CONTINUE;
    END IF;
    IF r.k2 IS NULL THEN
      v_guard := format('  IF NOT public._auth_user_has_permission(%L) THEN RAISE EXCEPTION %L USING ERRCODE = ''42501''; END IF;',
                        r.k1, 'Not authorized to '||r.lbl);
    ELSE
      v_guard := format('  IF NOT public._auth_user_has_permission(%L) AND NOT public._auth_user_has_permission(%L) THEN RAISE EXCEPTION %L USING ERRCODE = ''42501''; END IF;',
                        r.k1, r.k2, 'Not authorized to '||r.lbl);
    END IF;
    v_new := regexp_replace(v_def, '(\r?\n[ \t]*[Bb][Ee][Gg][Ii][Nn][ \t]*\r?\n)', '\1' || v_guard || chr(10));
    IF v_new = v_def THEN
      RAISE EXCEPTION 'guard injection failed (outer BEGIN not matched) for %', r.sig;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'guarded %', r.sig;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
