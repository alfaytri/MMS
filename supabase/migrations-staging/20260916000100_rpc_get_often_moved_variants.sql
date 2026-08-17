-- Picture Transfer (v2) — "⭐ Often moved" strip.
-- Top brand-variants transferred OUT of a warehouse in the last 90 days,
-- ranked by frequency. SECURITY DEFINER + an RP-membership guard: the caller
-- must be a Responsible Person of p_from_warehouse_id (same trust boundary as
-- the picture page itself).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_often_moved_variants(
  p_from_warehouse_id uuid,
  p_limit int DEFAULT 8
)
RETURNS TABLE (brand_variant_id uuid, move_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ti.brand_variant_id, count(*) AS move_count
  FROM public.warehouse_transfers t
  JOIN public.warehouse_transfer_items ti ON ti.transfer_id = t.id
  WHERE t.from_warehouse_id = p_from_warehouse_id
    AND t.created_at >= (now() - interval '90 days')
    AND ti.brand_variant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.warehouse_responsible_persons wrp
      WHERE wrp.warehouse_id = p_from_warehouse_id
        AND wrp.profile_id = public._current_user_data_id()
    )
  GROUP BY ti.brand_variant_id
  ORDER BY move_count DESC, ti.brand_variant_id
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.get_often_moved_variants(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_often_moved_variants(uuid, int) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
