-- 20260831002200_tracking_mode_guard_allow_serialized_to_bulk.sql
-- Refine guard_item_division_tracking_mode_switch (Tools Per-Division Mode).
--
-- The guard blocked EVERY effective-mode change on an (item,division) that holds
-- any stock. That is too strict for one direction: flipping serialized → bulk
-- when the division holds ONLY bulk qty and NO serial units is corrective, not
-- destructive — the qty already lives in fifo_cost_layers (bulk-shaped), so bulk
-- mode matches the stock rather than orphaning it. This is exactly the new-prod
-- state after the counted-qty inventory load (tools got bulk qty while still
-- inheriting the serialized category default), which stranded 67 Trading tools.
--
-- Still blocked (unchanged): → serialized while any stock exists (qty can't
-- become serial units), and → bulk while serial units exist (units would be
-- orphaned under qty tracking). The exception ONLY relaxes new_eff='bulk' AND
-- units=0. Live body fetched via pg_get_functiondef before editing.
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

  -- Corrective exception: serialized → bulk with ONLY bulk qty (no serial units)
  -- is safe — the qty is already bulk-shaped. Everything else stays blocked.
  IF (v_units > 0 OR v_qty > 0)
     AND NOT (v_new_eff = 'bulk'::public.tool_tracking_mode AND v_units = 0) THEN
    RAISE EXCEPTION
      'Cannot set this tool''s tracking mode in this division while it holds stock: % unit(s), % qty on hand. Empty the division first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
