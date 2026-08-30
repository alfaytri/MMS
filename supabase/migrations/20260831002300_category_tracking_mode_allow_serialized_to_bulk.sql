-- 20260831002300_category_tracking_mode_allow_serialized_to_bulk.sql
-- Category-level tracking-mode switch: allow serialized -> bulk when the category
-- holds ONLY bulk qty and NO serial units. Mirrors the per-division relaxation
-- (20260831002200) at the CATEGORY level, for both enforcement points:
--   * guard_tool_tracking_mode_switch  (BEFORE UPDATE trigger on the category)
--   * rpc_cascade_category_tracking_mode (propagates the mode to descendants)
--
-- Why: the counted-qty inventory load put bulk qty on tools whose categories
-- still default to serialized (0 serial units exist anywhere). Flipping such a
-- category serialized -> bulk is corrective — the qty is already bulk-shaped, so
-- bulk matches the stock rather than orphaning it. Still blocked everywhere:
-- -> serialized while any stock exists (qty can't become serial units), and
-- -> bulk while serial units exist (units would be orphaned under qty tracking).
-- Live bodies fetched via pg_get_functiondef before editing.

-- ── 1. Category guard ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_tool_tracking_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Corrective exception: serialized -> bulk with ONLY bulk qty (no serial units).
  IF (v_units > 0 OR v_qty > 0)
     AND NOT (NEW.tool_tracking_mode = 'bulk'::public.tool_tracking_mode AND v_units = 0) THEN
    RAISE EXCEPTION
      'Cannot switch tracking mode while the category holds stock: % asset unit(s), % qty on hand. Empty the category first.',
      v_units, v_qty
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. Cascade RPC ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cascade_category_tracking_mode(p_category_id uuid, p_mode tool_tracking_mode)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_changed text[] := ARRAY[]::text[];
  v_locked  text[] := ARRAY[]::text[];
  r RECORD;
  v_has_units boolean;
  v_has_qty   boolean;
  v_locked_row boolean;
BEGIN
  IF p_category_id IS NULL OR p_mode IS NULL THEN
    RAISE EXCEPTION 'category id and mode are required';
  END IF;

  FOR r IN
    WITH RECURSIVE subtree AS (
      SELECT id, name_en, tool_tracking_mode, 0 AS depth
        FROM inventory_categories
       WHERE id = p_category_id
      UNION ALL
      SELECT c.id, c.name_en, c.tool_tracking_mode, s.depth + 1
        FROM inventory_categories c
        JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id, name_en, tool_tracking_mode
      FROM subtree
     WHERE depth > 0
     ORDER BY name_en
  LOOP
    CONTINUE WHEN r.tool_tracking_mode IS NOT DISTINCT FROM p_mode;

    v_has_units := EXISTS (
      SELECT 1 FROM tool_asset_units tau
      JOIN inventory_items ii ON ii.id = tau.item_id
      WHERE ii.category_id = r.id
    );
    v_has_qty := EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
      JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
      WHERE ii.category_id = r.id
    );

    -- Lock (skip) only for the unsafe cases: any serial units, or moving to a
    -- non-bulk mode while bulk qty exists. serialized -> bulk with only qty is
    -- the corrective, allowed flip.
    v_locked_row := v_has_units
      OR (v_has_qty AND p_mode <> 'bulk'::tool_tracking_mode);

    IF v_locked_row THEN
      v_locked := v_locked || r.name_en;
    ELSE
      UPDATE inventory_categories SET tool_tracking_mode = p_mode WHERE id = r.id;
      v_changed := v_changed || r.name_en;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'changed', to_jsonb(v_changed),
    'locked',  to_jsonb(v_locked)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
