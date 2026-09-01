-- 20261033000000_batchF_m7_revert_idempotent.sql  (audit M7)
--
-- M7: revert_landed_cost reverses COGS and cost-adjustment movements by INSERTing
-- counter-entries and LEAVING the originals in place. On apply -> revert -> re-apply
-- -> revert, the second revert's `WHERE landed_cost_id = p_lc_id AND total_cost > 0`
-- (and the movement equivalent) re-matches the FIRST application's positive rows and
-- reverses them a second time, so net COGS drifts by that application's amount.
--
-- Fix: make revert idempotent by DELETING the LC's landed-cost COGS rows and its
-- cost-adjustment movements instead of countering them. Net P&L effect is identical
-- (a reverted LC contributes 0), re-revert finds nothing to double-count, and the
-- layer uplift reversal (driven by the fresh revert_snapshot) is unchanged.

DO $do$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.revert_landed_cost(uuid,text)'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION 'revert_landed_cost not found'; END IF;
  IF v_def ~ 'DELETE FROM cogs_entries\s+WHERE landed_cost_id = p_lc_id' THEN
    RAISE NOTICE 'M7 already idempotent — skip';
    RETURN;
  END IF;

  v_new := v_def;
  -- movements: counter-INSERT -> DELETE the LC's cost-adjustment movements
  v_new := regexp_replace(v_new,
    'INSERT INTO inventory_stock_movements.*?AND unit_cost\s*>\s*0;',
    'DELETE FROM inventory_stock_movements' || E'\n    WHERE reference_type = ''landed_cost''\n      AND reference_id   = p_lc_id\n      AND movement_type  = ''cost_adjustment'';',
    'g');
  -- cogs: counter-INSERT -> DELETE the LC's landed-cost (and any prior reversal) rows
  v_new := regexp_replace(v_new,
    'INSERT INTO cogs_entries.*?AND total_cost\s*>\s*0;',
    'DELETE FROM cogs_entries' || E'\n    WHERE landed_cost_id = p_lc_id\n      AND source_type IN (''landed_cost'', ''landed_cost_reversal'');',
    'g');

  IF v_new !~ 'DELETE FROM cogs_entries\s+WHERE landed_cost_id = p_lc_id'
     OR v_new !~ 'DELETE FROM inventory_stock_movements\s+WHERE reference_type = ''landed_cost'''
     OR v_new ~ 'INSERT INTO cogs_entries'
     OR v_new ~ 'INSERT INTO inventory_stock_movements' THEN
    RAISE EXCEPTION 'M7: edits did not land cleanly — aborting';
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'M7: revert_landed_cost is now idempotent (deletes instead of countering)';
END
$do$;

NOTIFY pgrst, 'reload schema';
