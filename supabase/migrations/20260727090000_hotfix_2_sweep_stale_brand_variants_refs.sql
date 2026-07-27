-- HOTFIX 2 for Section 10 — sweep stale inventory_brand_variants refs
--
-- The Section 10 migration 20260727070000 was written by copying
-- baseline function bodies which still referenced the OLD table name
-- `inventory_brand_variants`. That name was renamed to
-- `inventory_item_brand_variants` in 20260724180001 (compat view added
-- + then subsequently dropped), and the 20260725140001 sweep swapped
-- refs in most functions. My rewrites regressed 5 of them:
--
--   * deduct_fifo_layers        (hotfix 1 already re-shipped with wrong name)
--   * complete_delivery_inventory
--   * approve_stock_adjustment_inventory
--   * allocate_warehouse_stock
--   * rpc_process_po_return_dispatch
--
-- Same pass also catches 2 pre-existing offenders that the 20260725140001
-- sweep missed:
--
--   * apply_adjustment
--   * rpc_process_return_restock
--
-- Fix: same regex-swap-and-re-CREATE pattern as 20260725140001. Zero
-- semantic change — just name-swaps `inventory_brand_variants` →
-- `inventory_item_brand_variants` in every function body that still
-- carries the old name.

BEGIN;

DO $rewrite$
DECLARE
  v_row  RECORD;
  v_def  text;
  v_new  text;
  v_ok   int := 0;
  v_fail int := 0;
BEGIN
  FOR v_row IN
    SELECT p.oid, p.proname
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosrc ~ '\minventory_brand_variants\M'
    ORDER BY p.proname
  LOOP
    BEGIN
      v_def := pg_get_functiondef(v_row.oid);
      v_new := regexp_replace(v_def, '\minventory_brand_variants\M', 'inventory_item_brand_variants', 'g');
      IF v_new IS DISTINCT FROM v_def THEN
        EXECUTE v_new;
        v_ok := v_ok + 1;
        RAISE NOTICE 'OK  %', v_row.proname;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1;
      RAISE NOTICE 'FAIL % — %', v_row.proname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '---';
  RAISE NOTICE 'Rewritten: %, Failed: %', v_ok, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'Some rewrites failed — see NOTICE lines above';
  END IF;
END
$rewrite$;

NOTIFY pgrst, 'reload schema';

COMMIT;
