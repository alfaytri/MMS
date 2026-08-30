-- 20260831001200_default_tool_tracking_mode_bulk.sql
-- Selling Bulk Tools plan — Task 1: default NEW tool categories to 'bulk'.
--
-- Bulk tools are the sellable / quantity kind (bought, sold, and consumed via
-- FIFO like consumables); serialized (one tool_asset_units row per physical
-- unit, held in team custody) becomes the deliberate opt-in. Changing only the
-- column DEFAULT is forward-only: every existing category keeps its stored
-- mode, and the populated-category switch guard
-- (trg_guard_tool_tracking_mode_switch, 20260826000200) is left exactly as-is.
--
-- Live-schema check (2026-08-30, staging mwvblpgbgxipvrevkeff via
-- information_schema): inventory_categories.tool_tracking_mode is
--   tool_tracking_mode NOT NULL DEFAULT 'serialized'::tool_tracking_mode
-- enum values {serialized,bulk}; 20 serialized + 2 bulk tool categories exist.
BEGIN;

ALTER TABLE public.inventory_categories
  ALTER COLUMN tool_tracking_mode SET DEFAULT 'bulk';

COMMENT ON COLUMN public.inventory_categories.tool_tracking_mode IS
  'Meaningful only when type=''tools''. serialized => tool_asset_units per unit (team custody); bulk => qty/FIFO/pools like consumables (sellable). Default bulk. Ignored for products/spare-parts/consumables.';

NOTIFY pgrst, 'reload schema';
COMMIT;
