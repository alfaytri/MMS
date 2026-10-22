-- ─────────────────────────────────────────────────────────────────────────────
-- Make inventory_items.total_stock self-maintaining.
--
-- THE BUG
-- `fifo_cost_layers` is the source of truth for stock. A trigger already keeps
-- `warehouse_stock_summary` in step with it. Two caches had no trigger at all:
--   * inventory_item_brand_variants.stock_level
--   * inventory_items.total_stock
--
-- THIRTEEN functions write stock_level — create_inventory_receival,
-- create_and_approve_receival, apply_receival_edit, receive_transfer,
-- deduct_fifo_layers, allocate_warehouse_stock, cancel_delivery_inventory,
-- approve_stock_adjustment_inventory, rpc_cancel_consumption,
-- rpc_cancel_po_return_dispatch, rpc_process_return_restock,
-- rpc_process_consumption_return_restock, rpc_import_inventory_stock — and
-- exactly ONE of them (rpc_import_inventory_stock) also refreshed total_stock.
--
-- So the original Excel import left it correct and every receival, transfer,
-- consumption and delivery since quietly broke it. On 2026-10-22 new-prod had
-- 143 items reading 0 while holding real stock, among them 12,000 vinyl gloves
-- and 61,700 shoe covers. The inventory list reads total_stock, so those items
-- looked out of stock while sitting on the shelf.
--
-- THE FIX
-- A trigger on the variants table, so the cache maintains itself the way
-- warehouse_stock_summary already does. One trigger closes all thirteen paths
-- at once, instead of patching twelve functions and trusting the fourteenth to
-- remember.
--
-- NOTES
--  * Fires only on INSERT, DELETE, and UPDATE OF stock_level/item_id — not on
--    every column write.
--  * The UPDATE is guarded by IS DISTINCT FROM, so a no-op change writes
--    nothing and does not churn inventory_items.updated_at.
--  * A variant moved between items refreshes BOTH parents.
--  * No recursion: it writes inventory_items, never inventory_item_brand_variants.
--  * Statement-level would be cheaper for bulk writes, but row-level is what
--    correctly handles a variant changing parents mid-statement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_refresh_item_total_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_items uuid[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_items := ARRAY[OLD.item_id];
  ELSIF TG_OP = 'INSERT' THEN
    v_items := ARRAY[NEW.item_id];
  ELSE
    v_items := ARRAY[NEW.item_id];
    IF OLD.item_id IS DISTINCT FROM NEW.item_id THEN
      v_items := v_items || OLD.item_id;   -- the variant changed parents
    END IF;
  END IF;

  UPDATE public.inventory_items i
     SET total_stock = COALESCE((
           SELECT SUM(v.stock_level)
             FROM public.inventory_item_brand_variants v
            WHERE v.item_id = i.id), 0)
   WHERE i.id = ANY(v_items)
     -- Only write when the value actually moves, so updated_at is not churned.
     AND i.total_stock IS DISTINCT FROM COALESCE((
           SELECT SUM(v.stock_level)
             FROM public.inventory_item_brand_variants v
            WHERE v.item_id = i.id), 0);

  RETURN NULL;   -- AFTER trigger; return value is ignored
END;
$function$;

COMMENT ON FUNCTION public.trg_refresh_item_total_stock() IS
  'Keeps inventory_items.total_stock equal to the sum of its variants'' '
  'stock_level. Before this, only rpc_import_inventory_stock refreshed it, so '
  'every other stock path left it stale.';

DROP TRIGGER IF EXISTS trg_variant_total_stock ON public.inventory_item_brand_variants;

CREATE TRIGGER trg_variant_total_stock
AFTER INSERT OR DELETE OR UPDATE OF stock_level, item_id
ON public.inventory_item_brand_variants
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_item_total_stock();

-- One-time repair for anything that drifted before the trigger existed.
-- stock_level first: recomputing total_stock from a drifted stock_level would
-- only launder the error.
UPDATE public.inventory_item_brand_variants v
   SET stock_level = COALESCE((
         SELECT SUM(l.remaining_qty) FROM public.fifo_cost_layers l
          WHERE l.brand_variant_id = v.id AND l.remaining_qty > 0), 0)
 WHERE v.stock_level IS DISTINCT FROM COALESCE((
         SELECT SUM(l.remaining_qty) FROM public.fifo_cost_layers l
          WHERE l.brand_variant_id = v.id AND l.remaining_qty > 0), 0);

UPDATE public.inventory_items i
   SET total_stock = COALESCE((
         SELECT SUM(v.stock_level) FROM public.inventory_item_brand_variants v
          WHERE v.item_id = i.id), 0)
 WHERE i.total_stock IS DISTINCT FROM COALESCE((
         SELECT SUM(v.stock_level) FROM public.inventory_item_brand_variants v
          WHERE v.item_id = i.id), 0);
