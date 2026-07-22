-- Final drop of tool_asset_items + its six purchase-chain FK columns.
--
-- The 2026-07-23 first attempt at this drop was rolled back because 4
-- master-data hooks + the Teams tool sheet + the audit-log resolver
-- still touched tool_asset_items. Follow-up tasks 1–4 rewired all of
-- those to inventory_items and today's commits removed the last dead
-- hooks. Now safe.
--
-- Data status on staging:
--   • tool_asset_items — 139 rows (mirrored to inventory_items on
--     2026-07-13); nothing joins to them anymore.
--   • Six tool_asset_item_id columns — all NULL after the 2026-07-23
--     Task-4 data migration.
--
-- tool_asset_units + related enums stay — that layer is preserved.

BEGIN;

-- Refuse to drop if any purchase-chain row still has a tool_asset_item_id.
DO $$
DECLARE v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM (
    SELECT 1 FROM public.po_line_items       WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.po_version_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.receival_items      WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.return_lines        WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_order_lines    WHERE tool_asset_item_id IS NOT NULL UNION ALL
    SELECT 1 FROM public.sale_delivery_lines WHERE tool_asset_item_id IS NOT NULL
  ) x;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Refusing to drop: % rows still have tool_asset_item_id set', v_remaining;
  END IF;
END $$;

ALTER TABLE public.po_line_items       DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.po_version_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.receival_items      DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.return_lines        DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.sale_order_lines    DROP COLUMN IF EXISTS tool_asset_item_id;
ALTER TABLE public.sale_delivery_lines DROP COLUMN IF EXISTS tool_asset_item_id;

DROP TABLE IF EXISTS public.tool_asset_items CASCADE;

COMMIT;
