-- Maintain inventory_brand_variants.incoming automatically from PO lines.
-- incoming = sum of (qty - received_qty) for active PO lines (approved / partially_received).

BEGIN;

-- ── Core refresh function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_refresh_incoming_qty(p_bv_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET incoming   = (
        SELECT COALESCE(
          SUM(GREATEST(pli.qty - COALESCE(pli.received_qty, 0), 0)),
          0
        )
        FROM po_line_items  pli
        JOIN purchase_orders po ON po.id = pli.po_id
        WHERE pli.brand_variant_id = p_bv_id
          AND po.status IN ('approved', 'partially_received')
          AND po.deleted_at IS NULL
      ),
      updated_at = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_refresh_incoming_qty(UUID) TO authenticated;

-- ── Trigger: po_line_items rows change ────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_po_line_items_incoming()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.brand_variant_id IS NOT NULL THEN
      PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.brand_variant_id IS NOT NULL THEN
    PERFORM fn_refresh_incoming_qty(NEW.brand_variant_id);
  END IF;

  -- If variant changed on UPDATE, refresh the old variant too
  IF TG_OP = 'UPDATE'
     AND OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id
     AND OLD.brand_variant_id IS NOT NULL
  THEN
    PERFORM fn_refresh_incoming_qty(OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_line_items_incoming ON po_line_items;
CREATE TRIGGER trg_po_line_items_incoming
AFTER INSERT OR UPDATE OR DELETE ON po_line_items
FOR EACH ROW EXECUTE FUNCTION trg_fn_po_line_items_incoming();

-- ── Trigger: PO status changes ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_purchase_orders_incoming()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM fn_refresh_incoming_qty(pli.brand_variant_id)
    FROM po_line_items pli
    WHERE pli.po_id          = NEW.id
      AND pli.brand_variant_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_incoming ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_incoming
AFTER UPDATE OF status ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION trg_fn_purchase_orders_incoming();

-- ── Backfill all existing variants ───────────────────────────────────────
UPDATE inventory_brand_variants bv
SET incoming = (
  SELECT COALESCE(
    SUM(GREATEST(pli.qty - COALESCE(pli.received_qty, 0), 0)),
    0
  )
  FROM po_line_items  pli
  JOIN purchase_orders po ON po.id = pli.po_id
  WHERE pli.brand_variant_id = bv.id
    AND po.status IN ('approved', 'partially_received')
    AND po.deleted_at IS NULL
);

COMMIT;
