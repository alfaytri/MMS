-- 20261044000000_tool_scrap_gating_schema.sql  (Phase 2, Task 1)
--
-- Schema for routing serialized tool scrap/write-off through the warehouse
-- approval chain instead of self-approving:
--   * stock_adjustments.tool_unit_id — links a write_off adjustment to the tool
--     unit being scrapped; the approval trigger (Task 2) retires the unit when
--     the adjustment is approved.
--   * tool_asset_units.pending_scrap — locks the unit while its scrap write-off
--     awaits approval (not assignable / movable / re-scrappable / retired) until
--     approved or rejected.
-- Additive, idempotent DDL (IF NOT EXISTS).

ALTER TABLE public.stock_adjustments
  ADD COLUMN IF NOT EXISTS tool_unit_id uuid REFERENCES public.tool_asset_units(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.stock_adjustments.tool_unit_id IS
  'Set when this write-off is a serialized tool scrap; the approval trigger retires the unit on approve.';

ALTER TABLE public.tool_asset_units
  ADD COLUMN IF NOT EXISTS pending_scrap boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tool_asset_units.pending_scrap IS
  'True while a scrap write-off awaits warehouse approval — unit is locked (not assignable/movable/retired) until approved or rejected.';

NOTIFY pgrst, 'reload schema';
