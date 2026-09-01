-- 20261050000000_fix_lc_validate_remaining_includes_transfers.sql
--
-- Fix the landed-cost Apply preview's "Remaining" undercount. validate_lc_allocation
-- summed remaining_qty only over layers with source_type='receival', so a layer
-- that was later moved by a TRANSFER (source_type='transfer', but still carrying
-- the original receival_id) was excluded — the preview showed e.g. 203 while the
-- real apply (allocate_landed_cost) books across all layers by receival_id (250).
-- That undercounted "Remaining" and could wrongly trigger the "all units already
-- sold" warning when units were merely transferred, not sold. Drop the
-- source_type filter so the preview matches allocate_landed_cost's actual scope
-- (receival_id only). Full CREATE OR REPLACE (prod body verified byte-identical
-- to staging pre-change).

CREATE OR REPLACE FUNCTION public.validate_lc_allocation(p_lc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- Sum remaining across ALL layers that trace to THIS LC's attached
        -- receivals (by receival_id) — including layers later moved by transfer
        -- (source_type='transfer'), exactly as allocate_landed_cost books it.
        -- A transferred layer keeps its receival_id and still receives the
        -- landed cost, so filtering source_type='receival' undercounted remaining
        -- and could wrongly flag "all units sold".
        SELECT SUM(fl.remaining_qty) AS remaining
        FROM   fifo_cost_layers fl
        WHERE  fl.brand_variant_id = ri.brand_variant_id
          AND  fl.remaining_qty > 0
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
$function$;

NOTIFY pgrst, 'reload schema';
