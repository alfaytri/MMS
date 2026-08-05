-- HOTFIX for Section 10 migration 20260727070000
--
-- Bug: the new deduct_fifo_layers introduced RETURNS TABLE columns named
-- source_type and source_id. Those become OUT parameters visible inside
-- the function body. The internal SELECT that walked fifo_cost_layers
-- also referenced its own source_type / source_id columns unqualified,
-- so Postgres raised:
--   42702: column reference "source_type" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
-- Every caller (complete_delivery_inventory, dispatch_transfer,
-- approve_stock_adjustment_inventory, rpc_process_po_return_dispatch,
-- allocate_warehouse_stock decrease branch, receive_transfer's use of
-- destination-layer creation) currently 400s at the deduct step.
--
-- Fix: alias the fifo_cost_layers table (`fcl`) and qualify the two
-- ambiguous references. No behaviour change — same ordering, same
-- locking, same returned data. Signature preserved (DROP not needed,
-- CREATE OR REPLACE works when only the body changes).

CREATE OR REPLACE FUNCTION public.deduct_fifo_layers(
  p_bv_id       uuid,
  p_wh_id       uuid,
  p_qty         integer,
  p_is_transfer boolean DEFAULT false
) RETURNS TABLE (
  layer_id      uuid,
  source_type   text,
  source_id     uuid,
  qty_taken     numeric,
  unit_cost     numeric,
  total_cost    numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r          RECORD;
  remaining  INT := p_qty;
  v_take     INT;
BEGIN
  FOR r IN
    SELECT fcl.id, fcl.remaining_qty, fcl.total_unit_cost,
           fcl.source_type AS r_source_type, fcl.source_id AS r_source_id
    FROM fifo_cost_layers fcl
    WHERE fcl.brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND fcl.warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND fcl.warehouse_id IS NULL)
      )
      AND fcl.remaining_qty > 0
    ORDER BY fcl.date ASC, fcl.receival_number ASC, fcl.created_at ASC, fcl.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    layer_id    := r.id;
    source_type := r.r_source_type;
    source_id   := r.r_source_id;
    qty_taken   := v_take;
    unit_cost   := r.total_unit_cost;
    total_cost  := v_take * r.total_unit_cost;
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

GRANT EXECUTE ON FUNCTION public.deduct_fifo_layers(uuid, uuid, integer, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
