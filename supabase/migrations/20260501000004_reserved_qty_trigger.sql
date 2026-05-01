-- Maintain inventory_brand_variants.reserved_qty automatically from confirmed
-- sale order lines. Replaces the drift-prone delta-RPC approach with a
-- recalculate-from-scratch pattern identical to fn_refresh_incoming_qty.
--
-- reserved_qty = SUM(sol.qty) for active SO lines (confirmed / partial_delivery).

BEGIN;

-- ── Core refresh function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_refresh_reserved_qty(p_bv_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET reserved_qty = (
        SELECT COALESCE(SUM(sol.qty), 0)
        FROM sale_order_lines sol
        JOIN sale_orders so ON so.id = sol.sale_order_id
        WHERE sol.brand_variant_id = p_bv_id
          AND so.status IN ('confirmed', 'partial_delivery')
          AND so.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_refresh_reserved_qty(UUID) TO authenticated;

-- ── Trigger: sale_order_lines rows change ─────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_sol_reserved_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_reserved_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_reserved_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sol_reserved_qty ON sale_order_lines;
CREATE TRIGGER trg_sol_reserved_qty
AFTER INSERT OR UPDATE OR DELETE ON sale_order_lines
FOR EACH ROW EXECUTE FUNCTION trg_fn_sol_reserved_qty();

-- ── Trigger: SO status changes ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_so_reserved_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_reserved_qty(sol.brand_variant_id)
    FROM sale_order_lines sol
    WHERE sol.sale_order_id   = NEW.id
      AND sol.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_so_reserved_qty ON sale_orders;
CREATE TRIGGER trg_so_reserved_qty
AFTER UPDATE OF status ON sale_orders
FOR EACH ROW EXECUTE FUNCTION trg_fn_so_reserved_qty();

-- ── Backfill all existing variants from ground truth ─────────────────────
UPDATE inventory_brand_variants bv
SET reserved_qty = (
  SELECT COALESCE(SUM(sol.qty), 0)
  FROM sale_order_lines sol
  JOIN sale_orders so ON so.id = sol.sale_order_id
  WHERE sol.brand_variant_id = bv.id
    AND so.status IN ('confirmed', 'partial_delivery')
    AND so.deleted_at IS NULL
);

COMMIT;
