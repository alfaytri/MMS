-- 20260919000100_rpc_team_item_variant_ids.sql
-- Returns the brand_variant ids whose EFFECTIVE team-item flag is true
-- (COALESCE(item.is_team_item, category.is_team_item, false)). The New
-- Consumption dialog uses this set to scope the item picker per tab: the Service
-- tab EXCLUDES team-items; the Team tab shows ONLY them. Read-only over the
-- globally-readable catalog (SECURITY INVOKER); not anon-executable.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_team_item_variant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT v.id
  FROM public.inventory_item_brand_variants v
  JOIN public.inventory_items      i ON i.id = v.item_id
  JOIN public.inventory_categories c ON c.id = i.category_id
  WHERE COALESCE(i.is_team_item, c.is_team_item, false)
$function$;

REVOKE ALL ON FUNCTION public.rpc_team_item_variant_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_team_item_variant_ids() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
