-- Warehouse Model v2 — Phase D.6.b cleanup
--
-- Retire the `[archived]` old per-vendor repair warehouses left behind by
-- D.6.b's consolidation. Historical `warehouse_transfers` + damaged-movement
-- rows are repointed to the shared Repair warehouse + the correct vendor
-- `sub_container_id` (via the transfer's `repair_vendor_id` bridge), then the
-- old per-vendor sub-containers and the archived warehouse rows are dropped.
--
-- Invariant assertion up front: no live stock-carrying rows (fifo layers,
-- stock movements, allocations, adjustments, receival items, stock summary,
-- damaged stock / damaged layers) may reference an archived warehouse. If any
-- do the migration RAISEs and rolls back — those cases would have to be
-- handled deliberately, not swept into a shared Repair warehouse.
--
-- The migration is idempotent — a second run finds no archived warehouses,
-- iterates zero times, and commits cleanly.

BEGIN;

DO $mig$
DECLARE
  v_shared_wh_id           uuid;
  v_archived_wh            record;
  v_old_sub                record;
  v_new_sub_id             uuid;

  v_fifo_leaks             int;
  v_movement_leaks         int;
  v_alloc_leaks            int;
  v_adjust_leaks           int;
  v_receival_leaks         int;
  v_summary_leaks          int;
  v_damaged_stock_leaks    int;
  v_damaged_layer_leaks    int;

  v_wt_to_repointed        int;
  v_wt_from_repointed      int;
  v_wt_items_repointed     int;
  v_damaged_mov_repointed  int;
  v_subs_deleted           int;
  v_whs_deleted            int;
  v_archived_count         int;
BEGIN
  -- ─────────────────────────────────────────────────────────────────
  -- 1. Locate the shared Repair warehouse.
  -- ─────────────────────────────────────────────────────────────────
  SELECT id INTO v_shared_wh_id
    FROM public.warehouses
   WHERE name = 'Repair' AND is_virtual = true
   LIMIT 1;

  IF v_shared_wh_id IS NULL THEN
    RAISE EXCEPTION 'D.6.b cleanup: shared "Repair" warehouse not found — did D.6.b Task 1 run?';
  END IF;

  RAISE NOTICE 'D.6.b cleanup: shared Repair warehouse id=%', v_shared_wh_id;

  -- ─────────────────────────────────────────────────────────────────
  -- 2. Invariant check: no live stock rows may reference an archived
  --    warehouse. D.6.b's precondition on staging said zero rows across
  --    fifo/movements/etc. — assert that here so a surprise on dev/prod
  --    fails loudly instead of silently corrupting audit history.
  -- ─────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_fifo_leaks
    FROM public.fifo_cost_layers f
    JOIN public.warehouses w ON w.id = f.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_movement_leaks
    FROM public.inventory_stock_movements m
    JOIN public.warehouses w ON w.id = m.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_alloc_leaks
    FROM public.warehouse_stock_allocations a
    JOIN public.warehouses w ON w.id = a.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_adjust_leaks
    FROM public.stock_adjustments s
    JOIN public.warehouses w ON w.id = s.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  -- receival_items has no direct warehouse_id; it inherits via
  -- receivals.warehouse_id.
  SELECT count(*) INTO v_receival_leaks
    FROM public.receival_items ri
    JOIN public.receivals r  ON r.id = ri.receival_id
    JOIN public.warehouses w ON w.id = r.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_summary_leaks
    FROM public.warehouse_stock_summary wss
    JOIN public.warehouses w ON w.id = wss.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_damaged_stock_leaks
    FROM public.inventory_damaged_stock ds
    JOIN public.warehouses w ON w.id = ds.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  SELECT count(*) INTO v_damaged_layer_leaks
    FROM public.inventory_damaged_stock_layers dsl
    JOIN public.warehouses w ON w.id = dsl.warehouse_id
   WHERE w.name LIKE '[archived]%' AND w.is_virtual = true;

  RAISE NOTICE 'Invariant check: fifo=% movements=% allocs=% adjustments=% receival_items=% stock_summary=% damaged_stock=% damaged_layers=%',
    v_fifo_leaks, v_movement_leaks, v_alloc_leaks, v_adjust_leaks,
    v_receival_leaks, v_summary_leaks, v_damaged_stock_leaks, v_damaged_layer_leaks;

  IF (v_fifo_leaks + v_movement_leaks + v_alloc_leaks + v_adjust_leaks
      + v_receival_leaks + v_summary_leaks
      + v_damaged_stock_leaks + v_damaged_layer_leaks) > 0 THEN
    RAISE EXCEPTION 'D.6.b cleanup aborted: live stock rows reference an archived repair warehouse (see counts above). Handle those explicitly before retrying.';
  END IF;

  -- ─────────────────────────────────────────────────────────────────
  -- 3. Iterate archived warehouses. For each:
  --      (a) repoint warehouse_transfers.from/to_warehouse_id + subs via
  --          the transfer's repair_vendor_id → vendor.sub_container_id.
  --      (b) repoint warehouse_transfer_items.sub_container_id for any
  --          old sub still referenced (same vendor bridge).
  --      (c) repoint inventory_damaged_movements.warehouse_id (unlikely
  --          on current code but harmless if zero rows).
  --      (d) delete the old (now unreferenced) sub_containers.
  --      (e) delete the archived warehouse row.
  --    RAISE NOTICE per step so the operator can eyeball what changed.
  -- ─────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_archived_count
    FROM public.warehouses
   WHERE name LIKE '[archived]%' AND is_virtual = true;

  RAISE NOTICE 'Found % archived repair warehouse(s) to retire', v_archived_count;

  FOR v_archived_wh IN
    SELECT id, name
      FROM public.warehouses
     WHERE name LIKE '[archived]%' AND is_virtual = true
  LOOP
    RAISE NOTICE '── Retiring % (id=%)', v_archived_wh.name, v_archived_wh.id;

    -- (a) Repoint warehouse_transfers.to_warehouse_id (send-for-repair direction).
    UPDATE public.warehouse_transfers wt
       SET to_warehouse_id     = v_shared_wh_id,
           to_sub_container_id = rv.sub_container_id,
           updated_at          = now()
      FROM public.repair_vendors rv
     WHERE wt.to_warehouse_id  = v_archived_wh.id
       AND wt.repair_vendor_id = rv.id;
    GET DIAGNOSTICS v_wt_to_repointed = ROW_COUNT;

    -- Repoint warehouse_transfers.from_warehouse_id (return-from-repair direction).
    UPDATE public.warehouse_transfers wt
       SET from_warehouse_id     = v_shared_wh_id,
           from_sub_container_id = rv.sub_container_id,
           updated_at            = now()
      FROM public.repair_vendors rv
     WHERE wt.from_warehouse_id  = v_archived_wh.id
       AND wt.repair_vendor_id   = rv.id;
    GET DIAGNOSTICS v_wt_from_repointed = ROW_COUNT;

    RAISE NOTICE '   warehouse_transfers: to_wh repointed=%  from_wh repointed=%',
      v_wt_to_repointed, v_wt_from_repointed;

    -- (b) Any transfer with warehouse_id repointed but sub_container_id still
    --     pointing at an old sub? Iterate the old subs and repoint anything
    --     referencing them via the vendor bridge.
    FOR v_old_sub IN
      SELECT id
        FROM public.warehouse_sub_containers
       WHERE warehouse_id = v_archived_wh.id
    LOOP
      -- Find the vendor whose old sub this was: any transfer with this
      -- sub_container_id has a repair_vendor_id that names the vendor.
      SELECT rv.sub_container_id INTO v_new_sub_id
        FROM public.warehouse_transfers wt
        JOIN public.repair_vendors rv ON rv.id = wt.repair_vendor_id
       WHERE wt.from_sub_container_id = v_old_sub.id
          OR wt.to_sub_container_id   = v_old_sub.id
       LIMIT 1;

      IF v_new_sub_id IS NULL THEN
        -- Fallback: transfer_items may still reference this old sub even if
        -- no transfer header does. Try mapping via the parent transfer.
        SELECT rv.sub_container_id INTO v_new_sub_id
          FROM public.warehouse_transfer_items wti
          JOIN public.warehouse_transfers wt ON wt.id = wti.transfer_id
          JOIN public.repair_vendors rv ON rv.id = wt.repair_vendor_id
         WHERE wti.sub_container_id = v_old_sub.id
         LIMIT 1;
      END IF;

      IF v_new_sub_id IS NOT NULL THEN
        UPDATE public.warehouse_transfer_items
           SET sub_container_id = v_new_sub_id
         WHERE sub_container_id = v_old_sub.id;
        GET DIAGNOSTICS v_wt_items_repointed = ROW_COUNT;

        UPDATE public.warehouse_transfers
           SET from_sub_container_id = v_new_sub_id, updated_at = now()
         WHERE from_sub_container_id = v_old_sub.id;

        UPDATE public.warehouse_transfers
           SET to_sub_container_id = v_new_sub_id, updated_at = now()
         WHERE to_sub_container_id = v_old_sub.id;

        RAISE NOTICE '   sub % → %: transfer_items repointed=%',
          v_old_sub.id, v_new_sub_id, v_wt_items_repointed;
      ELSE
        RAISE NOTICE '   sub % has no vendor mapping — will fail DELETE if anything still references it',
          v_old_sub.id;
      END IF;
    END LOOP;

    -- (c) Repoint inventory_damaged_movements.warehouse_id (defensive; current
    --     code writes p_warehouse_id here, but pre-D.6.b may have used the
    --     vendor's virtual warehouse).
    UPDATE public.inventory_damaged_movements
       SET warehouse_id = v_shared_wh_id
     WHERE warehouse_id = v_archived_wh.id;
    GET DIAGNOSTICS v_damaged_mov_repointed = ROW_COUNT;

    IF v_damaged_mov_repointed > 0 THEN
      RAISE NOTICE '   inventory_damaged_movements repointed=%', v_damaged_mov_repointed;
    END IF;

    -- (d) Delete now-unreferenced sub_containers under this archived warehouse.
    --     If anything still references them the FK ON DELETE RESTRICT fires
    --     and the whole migration rolls back — better to fail loudly than
    --     leave a half-cleaned state.
    DELETE FROM public.warehouse_sub_containers
     WHERE warehouse_id = v_archived_wh.id;
    GET DIAGNOSTICS v_subs_deleted = ROW_COUNT;
    RAISE NOTICE '   old sub_containers deleted=%', v_subs_deleted;

    -- (e) Delete the archived warehouse row.
    DELETE FROM public.warehouses
     WHERE id = v_archived_wh.id;
    GET DIAGNOSTICS v_whs_deleted = ROW_COUNT;
    RAISE NOTICE '   archived warehouse deleted (rows=%)', v_whs_deleted;
  END LOOP;

  RAISE NOTICE 'D.6.b cleanup complete. % archived warehouse(s) retired.', v_archived_count;
END $mig$;

COMMIT;
