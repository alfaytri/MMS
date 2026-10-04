-- 20261132000000_block_custody_source_on_generic_transfer.sql
--
-- The generic stock transfer (create_transfer_v2) is for moving stock FROM a
-- regular warehouse. Custody stock — anything held at a van, team, or project /
-- client site — must leave custody only through the Custody page's own flows:
--   * custody -> custody : rpc_create_custody_transfer (Custody card "Transfer")
--   * custody -> warehouse: rpc_create_custody_return   (Custody card "Return")
-- Those carry the accept step + FIFO/cost semantics the generic path skips.
--
-- Until now create_transfer_v2 happily created a `good_stock` transfer with a
-- CUSTODY SOURCE (e.g. VAN 1 -> Maintenance Team). Such rows never surface in the
-- custody Accept/Dispatch banner (which only reads transfer_kind='custody_assign')
-- and sit stuck forever. Block them at the source.
--
-- SCOPE = custody SOURCE only. A custody DESTINATION (regular warehouse -> team)
-- stays allowed: that is the Picture Transfer surface (get_my_transfer_sources
-- excludes virtual/custody warehouses, so its source is always a real warehouse)
-- plus the existing custody-destination division guard. Blocking the destination
-- would break Picture Transfer, so we do NOT.
--
-- Drift-proof position-splice: inject a self-contained guard (does its own
-- warehouse_kind lookup by the function's own param) right after the body BEGIN,
-- so it does not depend on internal variables. Idempotent (skips if the marker is
-- already present) and asserts the injection landed or aborts.

DO $do$
DECLARE
  v_def text; v_head text; v_new text; v_guard text;
  c_marker constant text := 'custody stock leaves custody only through the Custody page';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_transfer_v2';
  IF v_def IS NULL THEN RAISE EXCEPTION 'fn create_transfer_v2 not found'; END IF;

  IF position(c_marker in v_def) > 0 THEN
    RAISE NOTICE 'create_transfer_v2 already blocks custody source — skip';
    RETURN;
  END IF;

  v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
  IF v_head IS NULL THEN RAISE EXCEPTION 'no BEGIN anchor in create_transfer_v2'; END IF;

  v_guard := $q$ IF EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_from_warehouse_id AND w.warehouse_kind = 'custody') THEN RAISE EXCEPTION 'custody stock leaves custody only through the Custody page (Transfer to another location, or Return to a warehouse) — not the generic stock transfer' USING ERRCODE = '42501'; END IF;$q$;

  v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);
  IF position(c_marker in v_new) = 0 THEN
    RAISE EXCEPTION 'custody-source-block injection failed for create_transfer_v2';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'custody-source-block added to create_transfer_v2';
END
$do$;

NOTIFY pgrst, 'reload schema';
