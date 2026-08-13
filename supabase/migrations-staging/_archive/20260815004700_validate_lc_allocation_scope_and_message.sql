-- Follow-up to C5: validate_lc_allocation preview had the same scope bug
-- that allocate_landed_cost had — it summed remaining_qty across ALL layers
-- of the variant regardless of source, so the "Remaining" column in the
-- Apply-preview dialog didn't match what allocate_landed_cost actually saw
-- when the RPC ran. Also, the "not applicable" warning is misleading — the
-- LC share IS applied for fully-sold items, just entirely to COGS as a
-- retroactive adjustment. Rewriting both.

CREATE OR REPLACE FUNCTION public.validate_lc_allocation(p_lc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lc RECORD;
BEGIN
  SELECT id, applied_at, voided_at, attached_receival_ids
    INTO v_lc
    FROM landed_costs
   WHERE id = p_lc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost is voided and cannot be applied';
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already applied on %', v_lc.applied_at;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ri.brand_variant_id::TEXT           AS brand_variant_id,
        MAX(ri.item_name)                   AS item_name,
        MAX(ri.sku)                         AS sku,
        SUM(ri.qty_received)                AS qty_received,
        COALESCE(fl_agg.remaining, 0)       AS qty_remaining_in_layers,
        CASE WHEN COALESCE(fl_agg.remaining, 0) = 0
          THEN 'All units already sold — LC posts entirely to COGS as a retroactive cost adjustment (does not change past invoices)'
          ELSE NULL
        END                                 AS warning
      FROM receival_items ri
      JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
      LEFT JOIN LATERAL (
        -- Scope the remaining-qty sum to layers that came from THIS LC's
        -- attached receivals — matches allocate_landed_cost's C5 scope so
        -- the preview matches what the RPC will actually book.
        SELECT SUM(fl.remaining_qty) AS remaining
        FROM   fifo_cost_layers fl
        WHERE  fl.brand_variant_id = ri.brand_variant_id
          AND  fl.remaining_qty > 0
          AND  fl.source_type = 'receival'
          AND  fl.receival_id = ANY(v_lc.attached_receival_ids)
      ) fl_agg ON true
      WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
        AND ri.is_free = false
        AND ri.brand_variant_id IS NOT NULL
        AND ri.qty_received > 0
      GROUP BY ri.brand_variant_id, fl_agg.remaining
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_lc_allocation(uuid) TO authenticated;
