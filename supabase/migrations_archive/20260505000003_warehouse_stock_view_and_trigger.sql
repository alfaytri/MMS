-- supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql

-- 1. View: per-warehouse stock aggregated from FIFO layers
-- item_name, sku, unit live on inventory_items (via inventory_brand_variants.item_id)
CREATE OR REPLACE VIEW warehouse_stock_view AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ii.name_en                                                                  AS item_name,
  ibv.brand,
  ii.sku,
  ii.unit,
  SUM(f.remaining_qty)                                                        AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END                                                                         AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost)                                    AS total_value
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv ON ibv.id = f.brand_variant_id
JOIN   inventory_items ii           ON ii.id  = ibv.item_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY f.warehouse_id, f.brand_variant_id,
         ii.name_en, ibv.brand, ii.sku, ii.unit;

-- 2. Grant read access
GRANT SELECT ON warehouse_stock_view TO authenticated;

-- 3. Trigger function: keep warehouses.item_count + total_value accurate
-- Handles the case where a FIFO row moves from one warehouse to another (e.g. manual correction):
-- COALESCE(NEW, OLD) would only refresh one side, leaving the source warehouse stale.
-- So when warehouse_id changes on UPDATE, both old and new are refreshed.
CREATE OR REPLACE FUNCTION fn_refresh_warehouse_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wh_id UUID;
BEGIN
  -- When a row moves from warehouse A → warehouse B, refresh BOTH sides
  IF (TG_OP = 'UPDATE') AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id) THEN
    IF OLD.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = OLD.warehouse_id;
    END IF;
    IF NEW.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = NEW.warehouse_id;
    END IF;
    RETURN NULL;
  END IF;

  -- Normal case: INSERT, DELETE, or UPDATE where warehouse_id did not change
  v_wh_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  IF v_wh_id IS NULL THEN RETURN NULL; END IF;

  UPDATE warehouses SET
    item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    updated_at  = now()
  WHERE id = v_wh_id;

  RETURN NULL;
END;
$$;

-- 4. Attach trigger (guard against re-run)
DROP TRIGGER IF EXISTS trg_warehouse_stats ON fifo_cost_layers;
CREATE TRIGGER trg_warehouse_stats
AFTER INSERT OR UPDATE OR DELETE ON fifo_cost_layers
FOR EACH ROW EXECUTE FUNCTION fn_refresh_warehouse_stats();

-- 5. Transfer number sequence — prevents collisions from Math.random() in a multi-user environment
CREATE SEQUENCE IF NOT EXISTS warehouse_transfer_seq START 1;

CREATE OR REPLACE FUNCTION generate_transfer_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$$;

GRANT EXECUTE ON FUNCTION generate_transfer_number() TO authenticated;

-- 6. Backfill: fire trigger for every existing FIFO row to populate item_count/total_value
UPDATE fifo_cost_layers
SET remaining_qty = remaining_qty
WHERE warehouse_id IS NOT NULL;
