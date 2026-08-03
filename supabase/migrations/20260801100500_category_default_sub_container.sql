-- Warehouse Model v2 — Phase D.8 Task 1
-- Category → sub-container default routing.
--
-- Adds nullable `default_sub_container_id` on `inventory_categories` and a
-- recursive resolver that walks up the `parent_id` chain, returning the first
-- non-null default it encounters. Enforcement is soft — the receival dialog
-- uses this to pre-fill, operator can override.

ALTER TABLE public.inventory_categories
  ADD COLUMN IF NOT EXISTS default_sub_container_id uuid
    REFERENCES public.warehouse_sub_containers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_categories_default_sub_container
  ON public.inventory_categories(default_sub_container_id)
  WHERE default_sub_container_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_category_sub_container(p_category_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, default_sub_container_id, 0 AS depth
      FROM public.inventory_categories
     WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.default_sub_container_id, chain.depth + 1
      FROM public.inventory_categories c
      JOIN chain ON chain.parent_id = c.id
     WHERE chain.depth < 32
  )
  SELECT default_sub_container_id
    FROM chain
   WHERE default_sub_container_id IS NOT NULL
   ORDER BY depth ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_category_sub_container(uuid) TO anon, authenticated, service_role;

COMMENT ON COLUMN public.inventory_categories.default_sub_container_id IS
  'Optional routing hint. If null, resolution walks up parent_id chain. Used by the receival dialog to pre-fill the destination sub-container; not a placement constraint.';

COMMENT ON FUNCTION public.resolve_category_sub_container(uuid) IS
  'Walks up inventory_categories.parent_id chain from p_category_id and returns the first non-null default_sub_container_id. NULL if no default is set anywhere in the chain. Depth capped at 32 to guard against cycles.';
