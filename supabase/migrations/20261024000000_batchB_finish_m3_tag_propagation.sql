-- 20261024000000_batchB_finish_m3_tag_propagation.sql  (audit Batch B: H5 + M2)
--
-- The M3 fix taught the custody-ASSIGN path to carry the receival identity tag
-- across a stock move (dispatch stamps transfer_out.source_id = drained layer id;
-- accept makes the destination layer inherit receival_id from it). Three other
-- move paths never got it and still drop the tag, so landed cost mis-treats the
-- moved stock as sold (allocate_landed_cost scopes by receival_id):
--
--   * good_stock transfer  — dispatch_transfer + receive_transfer   (H5, HIGH)
--   * custody→custody move — rpc_create_custody_transfer            (M2, MED)
--   * custody return       — rpc_create_custody_return              (M2, MED)
--
-- Note fifo_cost_layers.source_type DEFAULTS to 'receival', so today the
-- good_stock destination layer silently masquerades as a receival with a NULL
-- tag. receive_transfer now sets source_type='transfer' explicitly and inherits
-- receival_id, matching the custody-accept reference implementation.
--
-- Drift-proof in-place transforms on the LIVE bodies (pg_get_functiondef+EXECUTE).
-- Each asserts its edits landed or RAISEs (whole migration rolls back, no change).
-- Idempotent via applied-state markers.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  -- ========================= 1. dispatch_transfer (H5a) =========================
  SELECT pg_get_functiondef('public.dispatch_transfer(uuid,uuid,text)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'dispatch_transfer not found'; END IF;
  IF v_def ~ 'v_layer\.layer_id' THEN
    RAISE NOTICE 'B1 dispatch_transfer already stamps source_id — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(movement_type, qty, unit_cost, reference_type, reference_id,\s+sub_container_id)(\s*\)\s*VALUES)',
      '\1, source_id\2', 'g');
    v_new := regexp_replace(v_new,
      '(''transfer_out'', -v_layer\.qty_taken, v_layer\.unit_cost,\s*''transfer'', p_transfer_id,\s+v_transfer\.from_sub_container_id)(\s*\))',
      '\1, v_layer.layer_id\2', 'g');
    IF v_new !~ 'reference_id,\s+sub_container_id, source_id' OR v_new !~ 'from_sub_container_id, v_layer\.layer_id' THEN
      RAISE EXCEPTION 'B1 dispatch_transfer: edits did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'B1 dispatch_transfer: transfer_out now carries source_id';
  END IF;

  -- ========================= 2. receive_transfer (H5b) =========================
  SELECT pg_get_functiondef('public.receive_transfer(uuid,uuid,text,jsonb)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'receive_transfer not found'; END IF;
  IF v_def ~ 'v_move\.source_id' THEN
    RAISE NOTICE 'B2 receive_transfer already inherits receival_id — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(SELECT id, qty, unit_cost)(\s+FROM inventory_stock_movements)',
      '\1, source_id\2', 'g');
    v_new := regexp_replace(v_new,
      '(qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty,\s+sub_container_id)(\s*\)\s*VALUES)',
      '\1, source_type, source_id, receival_id\2', 'g');
    v_new := regexp_replace(v_new,
      '(v_take, v_move\.unit_cost, 0, v_move\.unit_cost, v_take,\s+v_transfer\.to_sub_container_id)(\s*\))',
      '\1, ''transfer'', p_transfer_id, (select fcl.receival_id from public.fifo_cost_layers fcl where fcl.id = v_move.source_id)\2', 'g');
    IF v_new !~ 'SELECT id, qty, unit_cost, source_id'
       OR v_new !~ 'remaining_qty,\s+sub_container_id, source_type, source_id, receival_id'
       OR v_new !~ 'select fcl\.receival_id from public\.fifo_cost_layers fcl where fcl\.id = v_move\.source_id' THEN
      RAISE EXCEPTION 'B2 receive_transfer: edits did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'B2 receive_transfer: destination layer now inherits receival_id (source_type=transfer)';
  END IF;

  -- ==================== 3. rpc_create_custody_transfer (M2a) ====================
  SELECT pg_get_functiondef('public.rpc_create_custody_transfer(uuid,uuid,jsonb,text,uuid,text)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_create_custody_transfer not found'; END IF;
  IF v_def ~ 'v_layer\.layer_id' THEN
    RAISE NOTICE 'B3 rpc_create_custody_transfer already stamps source_id — skip';
  ELSE
    -- its deduct loop lacks layer_id — add it first
    v_new := regexp_replace(v_def,
      '(select )(qty_taken, unit_cost, total_cost\s+from public\.deduct_fifo_layers)',
      '\1layer_id, \2', 'g');
    v_new := regexp_replace(v_new,
      '(reference_type, reference_id)(\s*\)\s*values\s*\([^;]*?''transfer_out'', -v_layer\.qty_taken)',
      '\1, source_id\2', 'gi');
    v_new := regexp_replace(v_new,
      '(''transfer_out'', -v_layer\.qty_taken, v_layer\.unit_cost,\s*''transfer'', v_transfer_id)(\s*\))',
      '\1, v_layer.layer_id\2', 'g');
    IF v_new !~ 'select layer_id, qty_taken, unit_cost, total_cost'
       OR v_new !~ 'reference_type, reference_id, source_id'
       OR v_new !~ 'v_transfer_id, v_layer\.layer_id' THEN
      RAISE EXCEPTION 'B3 rpc_create_custody_transfer: edits did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'B3 rpc_create_custody_transfer: transfer_out now carries source_id';
  END IF;

  -- ==================== 4. rpc_create_custody_return (M2b) ======================
  SELECT pg_get_functiondef('public.rpc_create_custody_return(uuid,uuid,uuid,jsonb,text,uuid,text)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_create_custody_return not found'; END IF;
  IF v_def ~ 'reference_id, notes, source_id' THEN
    RAISE NOTICE 'B4 rpc_create_custody_return already stamps source_id — skip';
  ELSE
    v_new := regexp_replace(v_def,
      '(reference_type, reference_id, notes)(\s*\)\s*values\s*\([^;]*?''transfer_out'', -v_layer\.qty_taken)',
      '\1, source_id\2', 'gi');
    v_new := regexp_replace(v_new,
      '(''transfer'', v_transfer_id, nullif\(p_notes, ''''\))(\s*\))',
      '\1, v_layer.layer_id\2', 'g');
    IF v_new !~ 'reference_id, notes, source_id'
       OR v_new !~ 'nullif\(p_notes, ''''\), v_layer\.layer_id' THEN
      RAISE EXCEPTION 'B4 rpc_create_custody_return: edits did not land — aborting';
    END IF;
    EXECUTE v_new;
    RAISE NOTICE 'B4 rpc_create_custody_return: transfer_out now carries source_id';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
