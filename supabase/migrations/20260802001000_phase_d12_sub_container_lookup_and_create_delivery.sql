-- Phase D.12 Task 5 follow-up — sub-container lookup + create_and_confirm_delivery
--
-- Two changes needed so Kitchen can create a delivery draining from a
-- Maintenance sub-container (shared item consumption):
--
-- 1. `warehouse_sub_containers` is division-scoped by RLS, so Kitchen can't
--    see Maintenance's sub-containers when picking a Maintenance warehouse
--    on the delivery form. This RPC returns the minimum fields the UI needs
--    (id, name, division_id, division_name, is_active) with SECURITY DEFINER
--    so the picker can render them. Names are non-sensitive.
--
-- 2. `create_and_confirm_delivery` previously took only warehouse_id and
--    let `complete_delivery_inventory` derive the sub-container from the
--    SO's division. That derivation creates a Kitchen sub-container in a
--    Maintenance warehouse (wrong pool). Extended to accept an optional
--    p_sub_container_id and pass it through.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_warehouse_sub_containers(p_warehouse_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  division_id uuid,
  division_name text,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT sc.id, sc.name, sc.division_id, cd.name, sc.is_active
  FROM   public.warehouse_sub_containers sc
  LEFT   JOIN public.company_divisions cd ON cd.id = sc.division_id
  WHERE  sc.warehouse_id = p_warehouse_id
  ORDER  BY sc.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_sub_containers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_warehouse_sub_containers(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_warehouse_sub_containers(uuid) IS
'Phase D.12 Task 5 — returns sub-container info for a warehouse bypassing the division RLS on warehouse_sub_containers. Used by the delivery form so the caller can pick a sub-container in another division when consuming shared stock.';

-- Extend create_and_confirm_delivery to carry p_sub_container_id through to
-- complete_delivery_inventory. Keeps its original 5-arg signature valid via
-- DEFAULT NULL, so callers that don't yet pass the sub-container id (e.g.
-- rpc_create_partial_replacement inheritors) continue to work.

CREATE OR REPLACE FUNCTION public.create_and_confirm_delivery(
  p_so_id uuid,
  p_warehouse_id uuid,
  p_warehouse_name text,
  p_date date,
  p_items jsonb,
  p_sub_container_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, delivery_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_number TEXT;
  v_new_id          UUID;
  v_line            JSONB;
BEGIN
  v_delivery_number := public.next_delivery_number();

  INSERT INTO sale_deliveries (
    delivery_number, sale_order_id,
    warehouse_id, warehouse_name, date, status
  ) VALUES (
    v_delivery_number, p_so_id,
    p_warehouse_id, p_warehouse_name, p_date, 'pending'
  )
  RETURNING sale_deliveries.id INTO v_new_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_delivery_lines (
      sale_delivery_id, brand_variant_id, item_name, sku, qty_delivered
    ) VALUES (
      v_new_id,
      CASE WHEN v_line->>'brand_variant_id' IS NOT NULL
           AND v_line->>'brand_variant_id' <> 'null'
           THEN (v_line->>'brand_variant_id')::uuid END,
      COALESCE(v_line->>'item_name', 'Item'),
      NULLIF(v_line->>'sku', ''),
      COALESCE((v_line->>'qty_delivered')::integer, 0)
    );
  END LOOP;

  PERFORM complete_delivery_inventory(v_new_id, p_so_id, p_sub_container_id);

  RETURN QUERY SELECT v_new_id, v_delivery_number;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
