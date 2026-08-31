-- 20261018000000_pnl_recognize_all_inventory_losses.sql  (money bug #2, P&L scrap)
--
-- rpc_report_pnl only recognised the two canonical write-offs in its "scrap"
-- figure, so stock that leaves inventory (value removed via deduct_fifo_layers)
-- through three other paths was never booked as a loss — overstating gross profit:
--   * good-pile 'decrease' adjustments (lost / physical-count shrinkage)
--   * transfer_shrinkage (stock lost in transit)
--   * 'return_from_repair_as_writeoff' (unrepairable repair returns)
-- Folded into the same scrap figure per the owner's decision (all 3 -> Scrap line).
--
-- DRIFT-PROOF in-place transform on the LIVE body (pg_get_functiondef+EXECUTE),
-- NOT a reproduce: the deployed rpc_report_pnl has drifted from the tracked base
-- (it zeroes revenue for 'sale_replacement' and carries it in the COGS filter — a
-- change made after the base). A reproduce would silently revert that. This edits
-- only the scrap block, preserving everything else. Asserts all three edits landed
-- or aborts with no change. Idempotent.

DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_report_pnl(date,date,text,uuid[],uuid[])'::regprocedure) INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION '#2: rpc_report_pnl not found'; END IF;

  IF v_def ~ 'transfer_shrinkage' THEN
    RAISE NOTICE '#2: rpc_report_pnl already recognises all losses — skipping';
    RETURN;
  END IF;

  v_new := v_def;

  -- A. Good-pile: count 'decrease' (shrinkage) alongside 'write_off'
  v_new := regexp_replace(v_new,
    'AND sa\.adjustment_type::text = ''write_off''',
    'AND sa.adjustment_type::text IN (''write_off'', ''decrease'')', 'g');

  -- B. Insert a transfer_shrinkage subquery before the damaged-pile block
  v_new := regexp_replace(v_new,
    '(COALESCE\(\(\s+-- Damaged-pile)',
    'COALESCE((
      -- Transfer shrinkage: stock lost in transit, logged at the source
      -- sub-container. Division + warehouse scoped via sub_container -> division.
      SELECT SUM(ABS(sm.qty) * sm.unit_cost)
      FROM public.inventory_stock_movements sm
      LEFT JOIN public.warehouse_sub_containers wsc ON wsc.id = sm.sub_container_id
      WHERE sm.movement_type::text = ''transfer_shrinkage''
        AND sm.created_at::date BETWEEN p_start AND p_end
        AND public.is_division_visible(wsc.division_id)
        AND (p_division_ids  IS NULL OR wsc.division_id = ANY(p_division_ids))
        AND (p_warehouse_ids IS NULL OR sm.warehouse_id = ANY(p_warehouse_ids))
    ), 0)
    +
    \1', 'g');

  -- C. Damaged-pile: count unrepairable repair returns alongside damaged_write_off
  v_new := regexp_replace(v_new,
    'WHERE dm\.movement_type = ''damaged_write_off''',
    'WHERE dm.movement_type IN (''damaged_write_off'', ''return_from_repair_as_writeoff'')', 'g');

  IF (SELECT count(*) FROM regexp_matches(v_new, 'transfer_shrinkage', 'g')) <> 1
     OR v_new !~ 'adjustment_type::text IN \(''write_off'', ''decrease''\)'
     OR v_new !~ 'movement_type IN \(''damaged_write_off'', ''return_from_repair_as_writeoff''\)' THEN
    RAISE EXCEPTION '#2 transform: not all three scrap edits landed (anchors changed?) — aborting, no change';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE '#2: rpc_report_pnl scrap now includes decrease + transfer_shrinkage + repair-return write-offs';
END
$do$;

NOTIFY pgrst, 'reload schema';
