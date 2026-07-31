-- Warehouse Model v2 — Phase D.3 hotfix
--
-- Bug: deduct_fifo_layers' internal SELECT references `source_type`,
-- `source_id`, `sub_container_id` unqualified. Those are also OUT
-- parameters of the function (from RETURNS TABLE), so PL/pgSQL
-- raises "column reference source_type is ambiguous" at execution.
--
-- Same class of bug as the Section-10 hotfix (20260727080000). The
-- C.2.d rewrite (20260803000800) and Phase D.3 rewrite (20260803001800)
-- reintroduced the unqualified form. Fix by aliasing the table (fcl)
-- and qualifying every reference. Signature preserved — CREATE OR
-- REPLACE only touches the body.

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
    SELECT fcl.id,
           fcl.remaining_qty,
           fcl.total_unit_cost,
           fcl.source_type      AS r_source_type,
           fcl.source_id        AS r_source_id,
           fcl.sub_container_id AS r_sub_container_id
    FROM fifo_cost_layers fcl
    WHERE fcl.brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND fcl.warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND fcl.warehouse_id IS NULL)
      )
      AND fcl.remaining_qty > 0
      AND (p_sub_container_id IS NULL OR fcl.sub_container_id = p_sub_container_id)
    ORDER BY fcl.date ASC, fcl.receival_number ASC, fcl.created_at ASC, fcl.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id         := r.id;
    source_type      := r.r_source_type;
    source_id        := r.r_source_id;
    qty_taken        := v_take;
    unit_cost        := r.total_unit_cost;
    total_cost       := v_take * r.total_unit_cost;
    sub_container_id := r.r_sub_container_id;
    RETURN NEXT;

    remaining := remaining - v_take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  IF NOT p_is_transfer THEN
    UPDATE inventory_item_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  PERFORM recalc_average_cost(p_bv_id);
END;
$$;
