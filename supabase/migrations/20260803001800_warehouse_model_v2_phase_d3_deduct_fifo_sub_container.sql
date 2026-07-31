-- Warehouse Model v2 — Phase D.3
-- Add optional sub-container filter to deduct_fifo_layers.
-- When p_sub_container_id IS NULL: current behavior (backward-compat for other callers).
-- When set: restricts FIFO SELECT to layers within that sub-container.

DROP FUNCTION IF EXISTS public.deduct_fifo_layers(uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.deduct_fifo_layers(
  p_bv_id            uuid,
  p_wh_id            uuid,
  p_qty              integer,
  p_is_transfer      boolean,
  p_sub_container_id uuid DEFAULT NULL
) RETURNS TABLE (
  layer_id          uuid,
  source_type       text,
  source_id         uuid,
  qty_taken         integer,
  unit_cost         numeric,
  total_cost        numeric,
  sub_container_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost, source_type, source_id, sub_container_id
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
      AND (p_sub_container_id IS NULL OR sub_container_id = p_sub_container_id)
    ORDER BY date ASC, receival_number ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id         := r.id;
    source_type      := r.source_type;
    source_id        := r.source_id;
    qty_taken        := v_take;
    unit_cost        := r.total_unit_cost;
    total_cost       := v_take * r.total_unit_cost;
    sub_container_id := r.sub_container_id;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  PERFORM recalc_average_cost(p_bv_id);
END;
$$;
