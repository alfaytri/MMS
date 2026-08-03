-- Warehouse Model v2 — Phase E follow-up #7
--
-- Symptom: inventory item rows show "0 dmg" on brand variants that DO
-- have damaged stock on the Damaged Stock overview. The variant page and
-- the damaged-stock page disagree because `inventory_item_brand_variants.damaged_qty`
-- is a denormalized counter that only the stock-adjustment 'damage' flow
-- ever writes to. Sale-return restock, send-for-repair implicit restock,
-- and return-from-repair all update `inventory_damaged_stock` without
-- touching the counter.
--
-- Fix: install a trigger on `inventory_damaged_stock` (AFTER INSERT / UPDATE
-- / DELETE) that recomputes the per-variant damaged_qty as the SUM of qty
-- across all warehouses. Cheap, deterministic, self-healing — no matter
-- which RPC changes the damaged pile, the counter follows.
--
-- Also runs a one-shot backfill so existing drift is corrected on apply.

CREATE OR REPLACE FUNCTION public._sync_brand_variant_damaged_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_variant_id uuid;
BEGIN
  v_variant_id := COALESCE(NEW.brand_variant_id, OLD.brand_variant_id);
  IF v_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.inventory_item_brand_variants v
  SET    damaged_qty = COALESCE((
           SELECT SUM(ds.qty)::int
           FROM   public.inventory_damaged_stock ds
           WHERE  ds.brand_variant_id = v_variant_id
         ), 0),
         updated_at  = now()
  WHERE  v.id = v_variant_id;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_brand_variant_damaged_qty ON public.inventory_damaged_stock;

CREATE TRIGGER trg_sync_brand_variant_damaged_qty
AFTER INSERT OR UPDATE OF qty OR DELETE
ON public.inventory_damaged_stock
FOR EACH ROW
EXECUTE FUNCTION public._sync_brand_variant_damaged_qty();

-- One-shot backfill so existing variants stop lying about their damaged_qty.
UPDATE public.inventory_item_brand_variants v
SET    damaged_qty = COALESCE(sub.total_qty, 0),
       updated_at  = now()
FROM (
  SELECT ds.brand_variant_id, SUM(ds.qty)::int AS total_qty
  FROM   public.inventory_damaged_stock ds
  GROUP  BY ds.brand_variant_id
) sub
WHERE  sub.brand_variant_id = v.id
  AND  v.damaged_qty IS DISTINCT FROM COALESCE(sub.total_qty, 0);

-- Zero out variants that used to have damaged qty stamped but no longer
-- have any inventory_damaged_stock rows (or all rows sum to 0).
UPDATE public.inventory_item_brand_variants v
SET    damaged_qty = 0,
       updated_at  = now()
WHERE  v.damaged_qty <> 0
  AND  NOT EXISTS (
    SELECT 1
    FROM   public.inventory_damaged_stock ds
    WHERE  ds.brand_variant_id = v.id
      AND  ds.qty > 0
  );

COMMENT ON FUNCTION public._sync_brand_variant_damaged_qty() IS
'Phase E follow-up #7. Keeps inventory_item_brand_variants.damaged_qty in
sync with SUM(inventory_damaged_stock.qty) per variant. Fires on every
row-level change to inventory_damaged_stock.';
