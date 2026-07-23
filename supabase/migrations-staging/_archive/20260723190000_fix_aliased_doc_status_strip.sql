-- Follow-up to 20260723160000_drop_doc_status_rename_source_order_to_sale_order.
--
-- That migration stripped `AND doc_status != 'rejected'` from function bodies
-- but its regex did not account for the aliased form `AND <alias>.doc_status
-- != 'rejected'`. rpc_financial_dashboard, rpc_customer_statement, and
-- rpc_sales_aging_report use `AND i.doc_status != 'rejected'` in a few clauses,
-- so those references survived, and once so_invoices.doc_status was dropped
-- the RPCs began failing with `column i.doc_status does not exist` (400).
--
-- Fix: re-run the same strip loop with a regex that permits an optional
-- `<alias>.` prefix (identifier + dot) before `doc_status`.

BEGIN;

DO $$
DECLARE
  r RECORD;
  new_def TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prokind = 'f'
      AND  pg_get_functiondef(p.oid) ~ 'doc_status'
  LOOP
    new_def := r.def;
    -- Inline / trailing: ` AND [alias.]doc_status != 'rejected'`
    new_def := regexp_replace(new_def,
      '\s+AND\s+([A-Za-z_][A-Za-z0-9_]*\.)?doc_status\s*!=\s*''rejected''', '', 'g');
    -- Leading: `WHERE [alias.]doc_status != 'rejected' AND ` → `WHERE `
    new_def := regexp_replace(new_def,
      'WHERE\s+([A-Za-z_][A-Za-z0-9_]*\.)?doc_status\s*!=\s*''rejected''\s+AND\s+', 'WHERE ', 'g');
    -- Standalone: `WHERE [alias.]doc_status != 'rejected'`
    new_def := regexp_replace(new_def,
      'WHERE\s+([A-Za-z_][A-Za-z0-9_]*\.)?doc_status\s*!=\s*''rejected''', '', 'g');

    IF new_def <> r.def THEN
      EXECUTE new_def;
      RAISE NOTICE 'Stripped aliased doc_status filter from: %', r.proname;
    END IF;
  END LOOP;
END $$;

-- Sanity: no function should still reference doc_status now.
DO $$
DECLARE
  v_stragglers INT;
  v_names TEXT;
BEGIN
  SELECT COUNT(*), string_agg(p.proname, ', ')
    INTO v_stragglers, v_names
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prokind = 'f'
    AND  pg_get_functiondef(p.oid) ~ '\mdoc_status\M';
  IF v_stragglers > 0 THEN
    RAISE EXCEPTION 'Still % function(s) reference doc_status: %', v_stragglers, v_names;
  END IF;
END $$;

COMMIT;
