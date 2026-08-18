-- Tools & Assets Phase 1 refinement (R2): the Assign dialog becomes a
-- category -> item -> unit tree, so get_assignable_tool_units must also return
-- each unit's item_id + its item's category (id + leaf name).
--
-- Return-table shape changes, which CREATE OR REPLACE cannot do ("cannot change
-- return type of existing function") -> DROP + CREATE. Sole overload is
-- (uuid, text) (swept on staging 2026-08-21). Params, filters (ISSUE-9
-- NULL-division inclusion, not-retired, no-open-assignment, optional search),
-- LIMIT 200, and DEFINER/grants are all preserved from 20260920000300.

BEGIN;

DROP FUNCTION IF EXISTS public.get_assignable_tool_units(uuid, text);

CREATE FUNCTION public.get_assignable_tool_units(p_division_id uuid, p_search text DEFAULT NULL)
RETURNS TABLE(unit_id uuid, item_id uuid, item_name text, category_id uuid, category_name text,
              serial_number text, brand text, condition text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, i.id, i.name_en, c.id, c.name_en, u.serial_number, u.brand, u.condition::text
  FROM public.tool_asset_units u
  LEFT JOIN public.inventory_items i ON i.id = u.item_id
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE (u.division_id = p_division_id OR u.division_id IS NULL)
    AND u.status <> 'retired'
    AND NOT EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id = u.id AND a.released_at IS NULL)
    AND (p_search IS NULL OR length(trim(p_search)) = 0
         OR u.serial_number ILIKE '%'||p_search||'%'
         OR i.name_en ILIKE '%'||p_search||'%')
  ORDER BY c.name_en, i.name_en, u.serial_number
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_assignable_tool_units(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_assignable_tool_units(uuid, text) TO authenticated, service_role;

COMMIT;
