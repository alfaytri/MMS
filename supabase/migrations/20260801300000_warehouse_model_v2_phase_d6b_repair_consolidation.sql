-- Warehouse Model v2 — Phase D.6.b Task 1: Repair vendor consolidation
--
-- Before: each `repair_vendors` INSERT triggered `_repair_vendor_provision_warehouse`
-- which created a WHOLE new `warehouses` row (`Repair: <vendor>`, is_virtual=true)
-- and a single auto-created `warehouse_sub_containers` row under that per-vendor
-- warehouse. That produced one warehouse per vendor — visible everywhere the
-- operator picks or lists warehouses. The Master Data → Warehouses card grid
-- ended up with N "Repair: <vendor>" cards; D.6.a hid them from operator
-- pickers via the `is_virtual` filter but they still lived as separate rows.
--
-- After: ONE shared "Repair" warehouse (is_virtual=true, division_id=NULL).
-- Each vendor is a `warehouse_sub_containers` row under that shared warehouse.
-- New `repair_vendors.sub_container_id NOT NULL` column addresses the vendor's
-- sub. `virtual_warehouse_id` is redirected to the shared Repair warehouse so
-- code paths that read that field still land on a valid warehouse (used by the
-- Phase 9 RPCs' defensive `source <> vendor.virtual_warehouse_id` check).
--
-- Historical `inventory_damaged_movements.warehouse_id` rows referencing the
-- OLD per-vendor warehouses stay intact — the old warehouse rows are renamed
-- with an "[archived]" prefix and their `repair_vendor_id` FK is cleared, but
-- the rows themselves remain so history is auditable.
--
-- Precondition confirmed on staging 2026-08-01:
--   - 2 vendors (`_test repair`, `te3`)
--   - 0 active FIFO layers in per-vendor warehouses
--   - 0 rows on `inventory_stock_movements` for those warehouses
--   - 2 historical `inventory_damaged_movements.send_for_repair_out` rows
--
-- The RPCs (`rpc_send_damaged_for_repair`, `rpc_return_damaged_from_repair`)
-- are rewritten in a separate follow-up migration (Task 2) so this schema
-- migration can be applied and verified independently.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Add nullable sub_container_id column for backfill
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.repair_vendors
  ADD COLUMN IF NOT EXISTS sub_container_id uuid
    REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Ensure the shared "Repair" warehouse exists
-- ─────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE
  v_repair_wh_id  uuid;
  v_vendor        record;
  v_new_sub_id    uuid;
  v_old_wh_id     uuid;
BEGIN
  SELECT id INTO v_repair_wh_id
    FROM public.warehouses
   WHERE name = 'Repair' AND is_virtual = true
   LIMIT 1;

  IF v_repair_wh_id IS NULL THEN
    INSERT INTO public.warehouses (name, is_virtual, division_id, location)
    VALUES ('Repair', true, NULL, 'Shared repair container — vendors as sub-containers')
    RETURNING id INTO v_repair_wh_id;

    RAISE NOTICE 'D.6.b: created shared Repair warehouse id=%', v_repair_wh_id;
  ELSE
    RAISE NOTICE 'D.6.b: shared Repair warehouse already exists id=%', v_repair_wh_id;
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Backfill: for each vendor without sub_container_id, create a
  --    sub-container under the shared Repair warehouse using the
  --    vendor's CURRENT name (in staging one vendor was renamed `te3`
  --    but its per-vendor warehouse row still says "Repair: test 2" —
  --    the sub-container adopts the current name).
  -- ─────────────────────────────────────────────────────────────────
  FOR v_vendor IN
    SELECT id, name, virtual_warehouse_id
      FROM public.repair_vendors
     WHERE sub_container_id IS NULL
  LOOP
    INSERT INTO public.warehouse_sub_containers
      (warehouse_id, division_id, name, is_active)
    VALUES
      (v_repair_wh_id, NULL, v_vendor.name, true)
    RETURNING id INTO v_new_sub_id;

    v_old_wh_id := v_vendor.virtual_warehouse_id;

    -- Redirect the vendor to the new addressing.
    UPDATE public.repair_vendors
       SET virtual_warehouse_id = v_repair_wh_id,
           sub_container_id     = v_new_sub_id,
           updated_at           = now()
     WHERE id = v_vendor.id;

    -- Archive the old per-vendor warehouse so it's clearly historical.
    -- Keep the row (2 inventory_damaged_movements rows reference it via
    -- warehouse_id; dropping would orphan them). Clear repair_vendor_id
    -- so the vendor no longer FK-references it.
    IF v_old_wh_id IS NOT NULL AND v_old_wh_id <> v_repair_wh_id THEN
      UPDATE public.warehouses
         SET name             = '[archived] ' || name,
             repair_vendor_id = NULL,
             updated_at       = now()
       WHERE id = v_old_wh_id
         AND name NOT LIKE '[archived]%';  -- idempotent
    END IF;

    RAISE NOTICE 'D.6.b: vendor % migrated to sub_container %', v_vendor.name, v_new_sub_id;
  END LOOP;
END $mig$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Enforce NOT NULL now that all rows are backfilled
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.repair_vendors
  ALTER COLUMN sub_container_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Rewrite the trigger: new vendors get ONLY a sub-container under
--    the shared Repair warehouse. No new warehouses.
--
-- Changed from AFTER INSERT to BEFORE INSERT so `sub_container_id`
-- (now NOT NULL) is populated by the trigger before Postgres validates
-- the constraint. The trigger also stamps virtual_warehouse_id (kept
-- for backward-compat with the RPCs' defensive source-check).
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_repair_vendor_provision_warehouse
  ON public.repair_vendors;

CREATE OR REPLACE FUNCTION public._repair_vendor_provision_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_repair_wh_id  uuid;
  v_new_sub_id    uuid;
BEGIN
  SELECT id INTO v_repair_wh_id
    FROM public.warehouses
   WHERE name = 'Repair' AND is_virtual = true
   LIMIT 1;

  IF v_repair_wh_id IS NULL THEN
    RAISE EXCEPTION '_repair_vendor_provision_warehouse: shared Repair warehouse missing — did the D.6.b migration run?';
  END IF;

  INSERT INTO public.warehouse_sub_containers
    (warehouse_id, division_id, name, is_active)
  VALUES
    (v_repair_wh_id, NULL, NEW.name, true)
  RETURNING id INTO v_new_sub_id;

  NEW.virtual_warehouse_id := v_repair_wh_id;
  NEW.sub_container_id     := v_new_sub_id;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_repair_vendor_provision_warehouse
  BEFORE INSERT ON public.repair_vendors
  FOR EACH ROW EXECUTE FUNCTION public._repair_vendor_provision_warehouse();

COMMIT;
