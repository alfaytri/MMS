-- 20260831001600_tools_per_division_mode_p3.sql
-- Tools Per-Division Tracking Mode — Phase 3 (SO picker per-division bulk).
-- Spec: docs/plans/2026-08-30-tools-per-division-mode.md
--
-- Returns the tool item ids whose EFFECTIVE mode in a given division is 'bulk'
-- (per-(item,division) override, else category default). The sale-order item
-- picker intersects this with owned stock so a tool is offered for sale only in
-- the divisions where it is bulk — a tool serialized in that division (custody)
-- is never offered, even if its category default is bulk, and vice-versa.
BEGIN;

CREATE OR REPLACE FUNCTION public.tool_bulk_items_in_division(p_division_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT it.id
  FROM public.inventory_items it
  JOIN public.inventory_categories ic ON ic.id = it.category_id AND ic.type = 'tools'
  WHERE it.status <> 'archived'
    AND public.tool_effective_mode(it.id, p_division_id) = 'bulk';
$$;

REVOKE ALL ON FUNCTION public.tool_bulk_items_in_division(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tool_bulk_items_in_division(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
