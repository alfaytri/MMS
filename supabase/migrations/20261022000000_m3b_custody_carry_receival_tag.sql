-- 20261022000000_m3b_custody_carry_receival_tag.sql  (M3, part b — custody path)
--
-- Make the receival_id tag travel through a CUSTODY move so landed cost (M3a)
-- finds moved stock. No schema change: the transfer_out movement's unused
-- source_id column relays the drained source layer id from dispatch to accept.
--
--   * rpc_dispatch_custody_assign: stamp source_id = drained layer id
--     (v_layer.layer_id) onto each transfer_out movement.
--   * rpc_accept_custody_assign: each destination layer inherits receival_id from
--     the source layer (looked up via the movement's source_id). NULL for
--     non-receival stock (imports/returns) — correct. Multi-hop passes the tag on.
--
-- DRIFT-PROOF: applied as an in-place transform on the LIVE function bodies
-- (pg_get_functiondef + EXECUTE, the repo's own idiom), NOT reproduced from a
-- migration file — an earlier attempt was built on a stale copy of accept (the
-- live one, 20260820000800, added p_receipts/shortfall handling). This edits
-- whatever is actually deployed. Every edit is asserted BALANCED (column-adds ==
-- value-adds); on any mismatch the whole migration aborts with no change, so it
-- can never leave a function with a broken column/value count. Idempotent.

DO $do$
DECLARE
  v_def text;
  v_new text;
  v_col int;
  v_val int;
  v_sel int;
  v_n   int;
BEGIN
  -- ===================== dispatch: stamp source_id on transfer_out =====================
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_dispatch_custody_assign';
  IF v_def IS NULL THEN RAISE EXCEPTION 'M3b: rpc_dispatch_custody_assign not found'; END IF;

  IF v_def ~ 'p_transfer_id, v_layer\.layer_id' THEN
    RAISE NOTICE 'M3b: dispatch already stamps source_id — skipping';
  ELSE
    -- value: append v_layer.layer_id to the transfer_out VALUES
    v_new := regexp_replace(v_def,
      '(''transfer_out'',\s*-v_layer\.qty_taken,\s*v_layer\.unit_cost,\s*''transfer'',\s*p_transfer_id)',
      '\1, v_layer.layer_id', 'g');
    -- column: add source_id to that same insert's column list
    v_new := regexp_replace(v_new,
      '(reference_type, reference_id)(\s*\)\s*values\s*\([^;]*?''transfer_out'',\s*-v_layer\.qty_taken)',
      '\1, source_id\2', 'gi');

    v_col := (SELECT count(*) FROM regexp_matches(v_new, 'reference_type, reference_id, source_id', 'g'));
    v_val := (SELECT count(*) FROM regexp_matches(v_new, 'p_transfer_id, v_layer\.layer_id', 'g'));
    IF v_col <> 1 OR v_val <> 1 THEN
      RAISE EXCEPTION 'M3b dispatch: unbalanced edit (source_id cols=%, layer_id vals=%) — aborting, no change', v_col, v_val;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3b: dispatch now stamps source_id on transfer_out';
  END IF;

  -- ===================== accept: inherit receival_id onto moved layers =====================
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_accept_custody_assign';
  IF v_def IS NULL THEN RAISE EXCEPTION 'M3b: rpc_accept_custody_assign not found'; END IF;

  IF v_def ~ 'v_move\.source_id' THEN
    RAISE NOTICE 'M3b: accept already inherits receival_id — skipping';
  ELSE
    -- how many custody destination inserts (custody_assign received + custody_return restock)
    v_n := (SELECT count(*) FROM regexp_matches(v_def,
      'source_type, source_id\s*\)\s*values\s*\([^;]*?''custody_(assign|return)'',\s*p_transfer_id', 'gi'));
    IF v_n < 1 THEN RAISE EXCEPTION 'M3b accept: no custody destination insert found — aborting'; END IF;

    -- (1) the transfer_out movement read gains source_id
    v_new := regexp_replace(v_def,
      '(select\s+qty,\s*unit_cost)(\s+from\s+public\.inventory_stock_movements)',
      '\1, source_id\2', 'gi');
    -- (2) each custody-layer insert gains a receival_id column
    v_new := regexp_replace(v_new,
      '(source_type, source_id)(\s*\)\s*values\s*\([^;]*?''custody_(assign|return)'',\s*p_transfer_id)',
      '\1, receival_id\2', 'gi');
    -- (3) ...and the matching value: the source layer's receival_id
    v_new := regexp_replace(v_new,
      '((''custody_assign''|''custody_return''),\s*p_transfer_id)',
      '\1, (select fcl.receival_id from public.fifo_cost_layers fcl where fcl.id = v_move.source_id)', 'g');

    v_sel := (SELECT count(*) FROM regexp_matches(v_new, 'select\s+qty,\s*unit_cost, source_id', 'gi'));
    v_col := (SELECT count(*) FROM regexp_matches(v_new, 'source_type, source_id, receival_id', 'g'));
    v_val := (SELECT count(*) FROM regexp_matches(v_new, 'select fcl\.receival_id from public\.fifo_cost_layers fcl where fcl\.id = v_move\.source_id', 'g'));
    IF v_sel <> 1 OR v_col <> v_n OR v_val <> v_n THEN
      RAISE EXCEPTION 'M3b accept: unbalanced edit (move-select=%, receival_id cols=%, vals=%, expected inserts=%) — aborting, no change', v_sel, v_col, v_val, v_n;
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'M3b: accept now inherits receival_id onto % moved custody layer(s)', v_n;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
