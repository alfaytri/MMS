-- 20260831001500_tools_per_division_display_rpc.sql
-- Tools Per-Division Tracking Mode — Phase 2 (catalog display read).
-- Spec: docs/plans/2026-08-30-tools-per-division-mode.md
--
-- Returns, for the tool items in a category that carry at least one per-division
-- mode override, one row per (item, division) with the effective mode + that
-- division's stock (bulk FIFO qty and/or serial unit count). Powers the
-- "one item, per-division modes" catalog row. Read-only; SECURITY DEFINER so
-- the master-data catalog sees the full picture (REVOKE anon / GRANT authenticated).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_tool_item_division_modes(p_category_id uuid)
RETURNS TABLE (
  item_id        uuid,
  item_name      text,
  division_id    uuid,
  division_name  text,
  effective_mode public.tool_tracking_mode,
  bulk_qty       numeric,
  unit_count     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ov_items AS (
    SELECT DISTINCT iid.item_id
    FROM public.inventory_item_divisions iid
    JOIN public.inventory_items it ON it.id = iid.item_id
    WHERE it.category_id = p_category_id
      AND iid.tool_tracking_mode IS NOT NULL
  )
  SELECT
    it.id,
    it.name_en,
    iid.division_id,
    cd.name,
    public.tool_effective_mode(it.id, iid.division_id),
    COALESCE((
      SELECT SUM(f.remaining_qty)
      FROM public.inventory_item_brand_variants v
      JOIN public.fifo_cost_layers f ON f.brand_variant_id = v.id
      JOIN public.warehouse_sub_containers sc ON sc.id = f.sub_container_id
      WHERE v.item_id = it.id AND sc.division_id = iid.division_id
    ), 0)::numeric,
    (SELECT count(*) FROM public.tool_asset_units u
      WHERE u.item_id = it.id AND u.division_id = iid.division_id)::integer
  FROM ov_items oi
  JOIN public.inventory_items it ON it.id = oi.item_id
  JOIN public.inventory_item_divisions iid ON iid.item_id = it.id
  JOIN public.company_divisions cd ON cd.id = iid.division_id
  ORDER BY it.name_en, cd.name;
$$;

REVOKE ALL ON FUNCTION public.get_tool_item_division_modes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tool_item_division_modes(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
