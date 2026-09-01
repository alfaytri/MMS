-- 20261041000000_create_transfer_v2_custody_dest_division_guard.sql
--
-- Phase 1 / Task 3 (H5, server side) — picture-transfer submits through
-- create_transfer_v2, which has no destination-division check, so a user could
-- send stock to a custody location in a division they don't belong to. Add a
-- TARGETED guard: when the destination sub-container is a CUSTODY location with
-- a division, block unless the caller is a member of that division. Classic
-- warehouse-to-warehouse transfers (non-custody destination) are unaffected.
--
-- FAIL-CLOSED: the condition is `is_division_member(...) IS NOT TRUE`, not
-- `NOT is_division_member(...)`. is_division_member returns NULL when the JWT
-- lacks user_type (its `user_type IN (...)` clause makes the OR null); a plain
-- NOT would then be NULL and the guard would silently pass. IS NOT TRUE blocks
-- on both false and null, so a malformed/absent claim cannot slip a transfer
-- through. In normal operation the JWT carries user_type and the two forms are
-- equivalent.
--
-- Drift-proof: idempotent, and self-healing — if an earlier apply left the
-- fail-open `NOT ...` form, this upgrades it in place; otherwise it injects the
-- guard right after the body BEGIN (case-insensitive), asserting or aborting.

DO $do$
DECLARE
  v_def text; v_head text; v_new text; v_guard text;
  c_marker constant text := 'destination is outside your division';
  c_old    constant text := 'NOT public.is_division_member(sc.division_id)';
  c_new    constant text := 'public.is_division_member(sc.division_id) IS NOT TRUE';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_transfer_v2';
  IF v_def IS NULL THEN RAISE EXCEPTION 'create_transfer_v2 not found'; END IF;

  IF position(c_marker in v_def) > 0 THEN
    IF position(c_old in v_def) > 0 THEN
      EXECUTE replace(v_def, c_old, c_new);
      RAISE NOTICE 'create_transfer_v2: division guard upgraded to fail-closed (IS NOT TRUE)';
    ELSE
      RAISE NOTICE 'create_transfer_v2: division guard already fail-closed — skip';
    END IF;
  ELSE
    v_head := (regexp_match(v_def, '^(.*?\mBEGIN\M)', 'i'))[1];
    IF v_head IS NULL THEN RAISE EXCEPTION 'no BEGIN anchor in create_transfer_v2'; END IF;
    v_guard := $q$ IF p_to_sub_container_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.warehouse_sub_containers sc JOIN public.warehouses w ON w.id = sc.warehouse_id WHERE sc.id = p_to_sub_container_id AND w.warehouse_kind = 'custody' AND sc.division_id IS NOT NULL AND public.is_division_member(sc.division_id) IS NOT TRUE) THEN RAISE EXCEPTION 'destination is outside your division' USING ERRCODE = '42501'; END IF;$q$;
    v_new := v_head || v_guard || substring(v_def from length(v_head) + 1);
    IF position(c_marker in v_new) = 0 THEN RAISE EXCEPTION 'division-guard injection failed'; END IF;
    EXECUTE v_new;
    RAISE NOTICE 'create_transfer_v2: custody-destination division guard injected (fail-closed)';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
