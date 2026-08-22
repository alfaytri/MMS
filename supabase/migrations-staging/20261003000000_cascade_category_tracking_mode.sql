-- Inventory (Tools & Assets): cascade a category's tool_tracking_mode change
-- (Bulk / Serialized) down to its descendant sub-categories, skipping any that
-- already hold stock/units (those are "locked" — the existing guard trigger
-- trg_guard_tool_tracking_mode_switch already forbids switching them).
--
-- Operator request 2026-08-22: changing a category to Bulk should flow down to
-- its sub-categories and items; a descendant with receival/stock keeps its
-- current mode, one with none changes along with the parent. Items have no
-- tracking-mode column of their own (an item inherits its category's mode), so
-- the cascade is category-only — items follow automatically.
--
-- SECURITY INVOKER: the per-row UPDATE runs as the caller, so the same RLS and
-- the same guard trigger that protect a direct category edit still apply. We
-- compute "locked" with the exact test the guard uses (any tool_asset_units, or
-- any fifo_cost_layers.remaining_qty > 0, for the category's items) and only
-- UPDATE the unlocked ones, so the guard trigger never fires-and-fails.
--
-- Returns { changed: [name_en...], locked: [name_en...] } (descendants only —
-- a node already at the target mode is skipped) so the UI can summarise.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_cascade_category_tracking_mode(
  p_category_id uuid,
  p_mode public.tool_tracking_mode
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_changed text[] := ARRAY[]::text[];
  v_locked  text[] := ARRAY[]::text[];
  r RECORD;
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
    -- Skip the root (depth 0): the caller sets the target's own mode through the
    -- normal category update; this RPC only propagates to descendants.
    SELECT id, name_en, tool_tracking_mode
      FROM subtree
     WHERE depth > 0
     ORDER BY name_en
  LOOP
    -- Already at the target mode → nothing to do, not reported.
    CONTINUE WHEN r.tool_tracking_mode IS NOT DISTINCT FROM p_mode;

    v_locked_row :=
      EXISTS (
        SELECT 1 FROM tool_asset_units tau
        JOIN inventory_items ii ON ii.id = tau.item_id
        WHERE ii.category_id = r.id
      )
      OR EXISTS (
        SELECT 1 FROM inventory_items ii
        JOIN inventory_item_brand_variants bv ON bv.item_id = ii.id
        JOIN fifo_cost_layers fcl ON fcl.brand_variant_id = bv.id AND fcl.remaining_qty > 0
        WHERE ii.category_id = r.id
      );

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
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_cascade_category_tracking_mode(uuid, public.tool_tracking_mode) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cascade_category_tracking_mode(uuid, public.tool_tracking_mode) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
