-- Phase 8 Sub-task 8.5: drop the legacy single-ledger surface.
--
-- The Phase 7 dual ledger (return_line_customer_resolutions +
-- return_line_inventory_dispositions) has been the source of truth since
-- Phase 7.2. Historical rows in return_line_resolutions were backfilled into
-- the new tables by 20260730000100_dual_ledger_views_and_backfill.sql, and
-- the interim bridge trigger was retired in 20260731000200 (Phase 8.3).
--
-- Pre-flight (recorded in PROGRESS.md task-start bullet):
--   * grep -r 'return_line_resolutions' src/         → only auto-gen types
--   * grep -r 'rpc_record_return_line_resolution' src/ → 0
--   * No migration after 20260730000200 references either object
--   * No foreign key targets public.return_line_resolutions
--
-- Historical over-writes in the legacy table (SR-00008 line 4deede59 had
-- 3 refunds on a 1-unit line; SR-00007 line cf846f4e had 4 store-credits
-- on a 2-unit line — see 7.7 section G) disappear with this drop. The
-- new-ledger state (1 refund / 2 store-credits) is correct and matches
-- return_lines.qty.

-- Drop the recorder first (idempotent — no-op if already gone).
-- Actual signature (7 args) from 20260729040300_rpc_resolution_recording.sql:
--   (p_return_line_id, p_resolution_type, p_qty,
--    p_sale_delivery_id, p_credit_note_id, p_inventory_stock_movement_id,
--    p_notes)
drop function if exists public.rpc_record_return_line_resolution(
  uuid, text, numeric, uuid, uuid, uuid, text
);

-- Phase 6 also had an internal `_record_return_line_resolution` in some
-- iterations. Never merged to main under that name in this repo, but a
-- defensive drop is cheap.
drop function if exists public._record_return_line_resolution(
  uuid, text, numeric, uuid, uuid, uuid, text
);
drop function if exists public._record_return_line_resolution(
  uuid, text, numeric, uuid, uuid, text
);

-- Drop the table. CASCADE handles the incidental indexes/policies that
-- were created alongside it in 20260729040100. Bridge trigger already
-- dropped in 8.3, so there is no live trigger to sever.
drop table if exists public.return_line_resolutions cascade;
