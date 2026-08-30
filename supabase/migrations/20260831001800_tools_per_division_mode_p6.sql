-- 20260831001800_tools_per_division_mode_p6.sql
-- Tools Per-Division Tracking Mode — Phase 6 (set-mode intake hardening).
-- Spec: docs/plans/2026-08-30-tools-per-division-mode.md
--
-- The Phase 6 bulk-apply tool (scripts/apply_tool_modes.py) writes
-- inventory_item_divisions.tool_tracking_mode from the operator's
-- "Tools - Set Tracking Mode.xlsx". Because 138 tool (item,division) pairs hold
-- stock with no assignment row yet, the intake UPSERTs — so it can INSERT a new
-- (item,division) override, not only UPDATE an existing one.
--
-- Phase 5 guarded only UPDATE. Extend the guard to INSERT too so the qty-XOR-
-- units invariant holds on every write path (intake, a future UI, direct SQL)
-- and is TOCTOU-safe (the script's stock pre-check is a snapshot; this fires in
-- the same transaction as the write). The function is made TG_OP-aware: on
-- INSERT there is no prior override, so the "old" override is treated as NULL
-- (inherit category) — a normal assignment (mode NULL, or set to the category's
-- own mode) is a no-op change and passes untouched.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_item_division_tracking_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_mode public.tool_tracking_mode;
  v_cat_mode public.tool_tracking_mode;
  v_old_eff  public.tool_tracking_mode;
  v_new_eff  public.tool_tracking_mode;
  v_units    int;
  v_qty      numeric;
BEGIN
  -- Prior override: NULL on INSERT (nothing existed), else the old row's value.
  v_old_mode := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tool_tracking_mode ELSE NULL END;

  IF NEW.tool_tracking_mode IS NOT DISTINCT FROM v_old_mode THEN
    RETURN NEW;  -- override unchanged (covers no-op updates and NULL-mode inserts)
  END IF;

  SELECT ic.tool_tracking_mode INTO v_cat_mode
  FROM inventory_items ii
  JOIN inventory_categories ic ON ic.id = ii.category_id
  WHERE ii.id = NEW.item_id;

  v_old_eff := COALESCE(v_old_mode, v_cat_mode);
  v_new_eff := COALESCE(NEW.tool_tracking_mode, v_cat_mode);
  IF v_old_eff IS NOT DISTINCT FROM v_new_eff THEN
    RETURN NEW;  -- effective mode unchanged (redundant override, or matches category)
  END IF;

  SELECT count(*) INTO v_units
  FROM tool_asset_units tau
  WHERE tau.item_id = NEW.item_id
    AND tau.division_id = NEW.division_id
    AND tau.status <> 'retired';

  SELECT COALESCE(sum(fcl.remaining_qty), 0) INTO v_qty
  FROM inventory_item_brand_variants bv
  JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
  JOIN warehouse_sub_containers sc ON sc.id = fcl.sub_container_id
  WHERE bv.item_id = NEW.item_id AND sc.division_id = NEW.division_id;

  IF v_units > 0 OR v_qty > 0 THEN
    RAISE EXCEPTION
      'Cannot set this tool''s tracking mode in this division while it holds stock: % unit(s), % qty on hand. Empty the division first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_item_division_tracking_mode_switch ON public.inventory_item_divisions;
CREATE TRIGGER trg_guard_item_division_tracking_mode_switch
  BEFORE INSERT OR UPDATE ON public.inventory_item_divisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_division_tracking_mode_switch();

COMMIT;
