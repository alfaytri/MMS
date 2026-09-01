-- 20260831001400_tools_per_division_mode_p1.sql
-- Tools Per-Division Tracking Mode — Phase 1 (schema + resolution; NO behavior change).
-- Spec: docs/plans/2026-08-30-tools-per-division-mode.md
--
-- Adds a nullable per-(item,division) tracking-mode override + an effective-mode
-- resolver. NULL inherits the category's mode, so every existing tool behaves
-- exactly as today until an override is set. This lets ONE catalog item be bulk
-- (sellable qty) in some divisions and serialized (per-unit custody) in others,
-- without a duplicate catalog record.
BEGIN;

ALTER TABLE public.inventory_item_divisions
  ADD COLUMN IF NOT EXISTS tool_tracking_mode public.tool_tracking_mode;

COMMENT ON COLUMN public.inventory_item_divisions.tool_tracking_mode IS
  'Per-(item,division) tools tracking-mode override. NULL = inherit inventory_categories.tool_tracking_mode. Lets one tool item be bulk in some divisions and serialized in others without a duplicate catalog record. Meaningful only when the item''s category type=''tools''.';

CREATE OR REPLACE FUNCTION public.tool_effective_mode(p_item_id uuid, p_division_id uuid)
RETURNS public.tool_tracking_mode
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT iid.tool_tracking_mode
       FROM public.inventory_item_divisions iid
      WHERE iid.item_id = p_item_id AND iid.division_id = p_division_id),
    (SELECT ic.tool_tracking_mode
       FROM public.inventory_items it
       JOIN public.inventory_categories ic ON ic.id = it.category_id
      WHERE it.id = p_item_id)
  );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
