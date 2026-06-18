BEGIN;

CREATE OR REPLACE FUNCTION validate_lc_allocation(p_lc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lc RECORD;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already applied on %', v_lc.applied_at;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost is voided and cannot be applied';
  END IF;

  -- Return per brand_variant summary identical to what allocate_landed_cost would process
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        ri.brand_variant_id::TEXT                     AS brand_variant_id,
        MAX(ri.item_name)                              AS item_name,
        MAX(ri.sku)                                    AS sku,
        SUM(ri.qty_received)                           AS qty_received,
        COALESCE((
          SELECT SUM(fl.remaining_qty)
          FROM   fifo_cost_layers fl
          WHERE  fl.brand_variant_id = ri.brand_variant_id
            AND  fl.remaining_qty > 0
        ), 0)                                          AS qty_remaining_in_layers,
        CASE
          WHEN COALESCE((
            SELECT SUM(fl.remaining_qty)
            FROM   fifo_cost_layers fl
            WHERE  fl.brand_variant_id = ri.brand_variant_id
              AND  fl.remaining_qty > 0
          ), 0) = 0
          THEN 'All units already sold — LC cost not applicable to this item'
          ELSE NULL
        END                                            AS warning
      FROM receival_items ri
      JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
      WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
        AND ri.is_free = false
        AND ri.brand_variant_id IS NOT NULL
      GROUP BY ri.brand_variant_id
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_lc_allocation(UUID) TO authenticated;

COMMIT;
