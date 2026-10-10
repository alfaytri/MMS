-- 20261135000000_block_custody_source_on_generic_transfer.sql  (full-build)
--
-- Port of the warehouse custody-source guard. Custody stock leaves custody only
-- through the Custody page flows (Transfer / Return), never the generic transfer.
-- Reject a custody-kind SOURCE warehouse in create_transfer_v2.
--
-- Full-build has TWO create_transfer_v2 overloads (a legacy 7-arg and the active
-- 9-arg used by the app), so this loops over EVERY overload and splices the guard
-- into each — drift-proof (self-contained lookup by the fn's own param) and
-- idempotent (skips an overload that already carries the marker). Warehouse has a
-- single overload; this loop handles both cases.

DO $do$
DECLARE
  r record; v_def text; v_head text; v_new text; v_guard text;
  c_marker constant text := 'custody stock leaves custody only through the Custody page';
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_transfer_v2'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position(c_marker in v_def) > 0 THEN
      RAISE NOTICE 'create_transfer_v2 oid % already blocks custody source - skip', r.oid;
      CONTINUE;
    END IF;

    v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
    IF v_head IS NULL THEN
      RAISE EXCEPTION 'no BEGIN anchor in create_transfer_v2 oid %', r.oid;
    END IF;

    v_guard := $q$ IF EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_from_warehouse_id AND w.warehouse_kind = 'custody') THEN RAISE EXCEPTION 'custody stock leaves custody only through the Custody page (Transfer to another location, or Return to a warehouse) - not the generic stock transfer' USING ERRCODE = '42501'; END IF;$q$;

    v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);
    IF position(c_marker in v_new) = 0 THEN
      RAISE EXCEPTION 'custody-source-block injection failed for create_transfer_v2 oid %', r.oid;
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'custody-source-block added to create_transfer_v2 oid %', r.oid;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';
