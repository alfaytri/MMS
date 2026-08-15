-- 20260826000200_guard_tool_tracking_mode_switch.sql
-- Populated-category guard: block flipping inventory_categories.tool_tracking_mode
-- while the category holds asset units OR qty stock. Empty categories (no units,
-- no remaining FIFO qty) switch freely. Enforced server-side via trigger so the
-- guard can't be bypassed by callers that skip the dialog's client-side disable.
--
-- Live-schema check (2026-08-15, via information_schema + pg_get_functiondef):
--   inventory_categories(id uuid, tool_tracking_mode tool_tracking_mode enum, type inventory_type enum)
--   tool_asset_units(id uuid, item_id uuid -> inventory_items.id)
--   inventory_items(id uuid, category_id uuid -> inventory_categories.id)
--   inventory_item_brand_variants(id uuid, item_id uuid -> inventory_items.id)
--   fifo_cost_layers(id uuid, brand_variant_id uuid -> inventory_item_brand_variants.id, remaining_qty integer)
-- All columns referenced below exist as-is; no drift from the plan draft.
-- Only pre-existing trigger on inventory_categories is set_updated_at_inventory_categories
-- (BEFORE UPDATE, unrelated) — no name or ordering conflict with the trigger added here.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tool_tracking_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_units int;
  v_qty   numeric;
BEGIN
  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM OLD.tool_tracking_mode THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  JOIN inventory_items ii ON ii.id = tau.item_id
  WHERE ii.category_id = NEW.id;

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_items ii
  JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  WHERE ii.category_id = NEW.id;

  IF v_units > 0 OR v_qty > 0 THEN
    RAISE EXCEPTION
      'Cannot switch tracking mode while the category holds stock: % asset unit(s), % qty on hand. Empty the category first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tool_tracking_mode_switch ON public.inventory_categories;
CREATE TRIGGER trg_guard_tool_tracking_mode_switch
  BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_tool_tracking_mode_switch();

NOTIFY pgrst, 'reload schema';
COMMIT;
