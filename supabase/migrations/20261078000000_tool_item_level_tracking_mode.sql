-- 20261070000000_tool_item_level_tracking_mode.sql
-- Per-tool tracking mode: let a single tools category hold both bulk and
-- serialized tools. Adds a nullable item-level override and slots it into the
-- effective-mode resolver between the per-(item,division) override and the
-- category default. NULL = inherit the category (every existing tool unchanged).
--
-- Resolution order (most specific wins):
--   per-(item,division) override  →  item-level override  →  category default
BEGIN;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS tool_tracking_mode public.tool_tracking_mode;

COMMENT ON COLUMN public.inventory_items.tool_tracking_mode IS
  'Item-level tools tracking-mode override. NULL = inherit inventory_categories.tool_tracking_mode. A per-(item,division) override (inventory_item_divisions.tool_tracking_mode) still wins over this. Meaningful only for items whose category type=''tools''.';

-- Re-resolve effective mode with the item-level override inserted in the middle.
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
    (SELECT it.tool_tracking_mode
       FROM public.inventory_items it
      WHERE it.id = p_item_id),
    (SELECT ic.tool_tracking_mode
       FROM public.inventory_items it
       JOIN public.inventory_categories ic ON ic.id = it.category_id
      WHERE it.id = p_item_id)
  );
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
