-- ============================================================
-- Issue 6: Normalize warehouse_transfers actor columns
--
-- 1. Drop created_by (text, always NULL — replaced by created_by_profile_id)
-- 2. Drop approved_by (text, always NULL — never written by any code)
-- 3. Add approved_by_profile_id (uuid FK to profiles) to match the
--    dispatched_by / received_by / cancelled_by pattern
-- 4. Update reject_transfer_v2 to write approved_by_profile_id
-- ============================================================

BEGIN;

-- 1. Drop dead columns
ALTER TABLE public.warehouse_transfers
  DROP COLUMN IF EXISTS created_by;

ALTER TABLE public.warehouse_transfers
  DROP COLUMN IF EXISTS approved_by;

-- 2. Add approved_by_profile_id with FK
ALTER TABLE public.warehouse_transfers
  ADD COLUMN IF NOT EXISTS approved_by_profile_id uuid
    REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_approved_by_profile_id
  ON public.warehouse_transfers (approved_by_profile_id);

-- 3. Update reject_transfer_v2 to write the new column
CREATE OR REPLACE FUNCTION public.reject_transfer_v2(
  p_transfer_id uuid,
  p_rejected_by_profile_id uuid,
  p_rejected_by_name text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_avg_cost NUMERIC;
BEGIN
  SELECT id, from_warehouse_id, to_warehouse_id, status, date
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status NOT IN ('pending', 'in_transit') THEN
    RAISE EXCEPTION 'Transfer % cannot be rejected — current status: %',
      p_transfer_id, v_transfer.status;
  END IF;

  UPDATE warehouse_transfers
  SET status = 'rejected',
      approved_by_profile_id = p_rejected_by_profile_id,
      approved_by_name = p_rejected_by_name,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT * FROM warehouse_transfer_items
    WHERE transfer_id = p_transfer_id
    ORDER BY brand_variant_id
  LOOP
    IF v_transfer.status = 'pending' THEN
      UPDATE warehouse_stock_allocations
      SET allocated_qty = GREATEST(allocated_qty - v_item.requested_qty, 0),
          updated_at = now()
      WHERE warehouse_id = v_transfer.from_warehouse_id
        AND brand_variant_id = v_item.brand_variant_id;

    ELSIF v_transfer.status = 'in_transit' THEN
      SELECT ABS(unit_cost) INTO v_avg_cost
      FROM inventory_stock_movements
      WHERE reference_id = p_transfer_id
        AND brand_variant_id = v_item.brand_variant_id
        AND movement_type = 'transfer_out'
      LIMIT 1;

      v_avg_cost := COALESCE(v_avg_cost, v_item.unit_cost);

      INSERT INTO fifo_cost_layers (
        brand_variant_id, warehouse_id, date,
        qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
      ) VALUES (
        v_item.brand_variant_id, v_transfer.from_warehouse_id,
        CURRENT_DATE,
        v_item.requested_qty, v_avg_cost, 0, v_avg_cost, v_item.requested_qty
      );

      INSERT INTO inventory_stock_movements (
        warehouse_id, brand_variant_id, item_name, sku,
        movement_type, qty, unit_cost, reference_type, reference_id, notes
      ) VALUES (
        v_transfer.from_warehouse_id, v_item.brand_variant_id,
        v_item.item_name, v_item.sku,
        'transfer_in', v_item.requested_qty, v_avg_cost,
        'transfer', p_transfer_id,
        'Transfer rejected — stock returned'
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
