-- Warehouse Model v2 — Phase D.4.c: Inventory Check scoped to sub-container
--
-- Before this migration, `inventory_checks` was warehouse-scoped only.
-- Counters counted total qty per variant across the whole warehouse; the
-- system_qty snapshot read the warehouse-wide `warehouse_stock_view`; and
-- generated `stock_adjustments` carried no `sub_container_id` — the D.4
-- create RPC then silently picked one via `_find_or_create_sub_container`,
-- so on a warehouse with 2+ active sub-containers of the same division
-- the variance was drained from an arbitrary sub-container. The counted
-- discrepancy really covered both, so the other sub-container's FIFO
-- diverged from reality without an audit trail.
--
-- This migration closes that gap:
--   1. New nullable column `inventory_checks.sub_container_id` (nullable
--      because legacy checks have none — RLS + the two RPCs handle
--      backward-compat via warehouse fallback).
--   2. `snapshot_inventory_check_system_qty` — when the check has a
--      sub_container_id, sums `fifo_cost_layers.remaining_qty` filtered
--      by that sub-container instead of using `warehouse_stock_view`
--      (which currently doesn't expose sub_container_id — that's D.5).
--      Legacy checks (no sub_container_id) preserve the existing
--      warehouse-wide snapshot.
--   3. `apply_inventory_check_adjustments` — passes
--      `v_check.sub_container_id` on the `stock_adjustments` INSERT.
--      When present, the D.4 stack scopes downstream FIFO drain to that
--      sub-container. NULL falls through to the auto-derive fallback
--      (single-sub warehouses stay working; multi-sub warehouses on
--      legacy checks still emit the pre-D.4.c behaviour — flagged as
--      a known limitation).
--
-- Bodies sourced live via pg_get_functiondef 2026-08-01.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Schema
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_checks
  ADD COLUMN IF NOT EXISTS sub_container_id uuid
    REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ix_inventory_checks_sub_container
  ON public.inventory_checks(sub_container_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. snapshot_inventory_check_system_qty — sub-container aware
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.snapshot_inventory_check_system_qty(
  p_check_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_warehouse_id     UUID;
  v_sub_container_id UUID;
BEGIN
  SELECT warehouse_id, sub_container_id
  INTO   v_warehouse_id, v_sub_container_id
  FROM   inventory_checks
  WHERE  id = p_check_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_sub_container_id IS NOT NULL THEN
    -- Sub-container-scoped snapshot: sum remaining_qty from fifo_cost_layers
    -- restricted to that sub-container. `warehouse_stock_view` doesn't yet
    -- expose sub_container_id (D.5), so we go straight to the layers.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(sq.qty, 0)
    FROM (
      SELECT brand_variant_id, SUM(remaining_qty)::NUMERIC AS qty
      FROM   fifo_cost_layers
      WHERE  warehouse_id     = v_warehouse_id
        AND  sub_container_id = v_sub_container_id
        AND  remaining_qty    > 0
      GROUP BY brand_variant_id
    ) sq
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND sq.brand_variant_id = ici.brand_variant_id;
  ELSE
    -- Legacy path (pre-D.4.c checks): warehouse-wide snapshot.
    UPDATE inventory_check_items ici
    SET system_qty_at_close = COALESCE(wsv.qty, 0)
    FROM warehouse_stock_view wsv
    WHERE ici.check_id = p_check_id
      AND ici.is_counted = true
      AND ici.system_qty_at_close IS NULL
      AND wsv.warehouse_id = v_warehouse_id
      AND wsv.brand_variant_id = ici.brand_variant_id;
  END IF;

  -- Items absent from the stock source — pin at 0 so the recon row has a
  -- frozen value.
  UPDATE inventory_check_items
  SET system_qty_at_close = 0
  WHERE check_id = p_check_id
    AND is_counted = true
    AND system_qty_at_close IS NULL;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. apply_inventory_check_adjustments — stamp sub_container_id on SA
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_inventory_check_adjustments(
  p_check_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_check          RECORD;
  v_item           RECORD;
  v_variance       NUMERIC;
  v_adj_type       text;
  v_adj_qty        NUMERIC;
  v_check_number   text;
  v_approver_id    uuid;
  v_approver_name  text;
  v_new_adj_id     uuid;
  v_step           RECORD;
  v_ord            INT;
BEGIN
  SELECT id, warehouse_id, sub_container_id, status, check_number
  INTO   v_check
  FROM   inventory_checks
  WHERE  id = p_check_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory check % not found', p_check_id;
  END IF;

  IF v_check.status <> 'approved' THEN
    RAISE EXCEPTION 'Check % is not approved (status: %)', p_check_id, v_check.status;
  END IF;

  v_check_number := v_check.check_number;

  PERFORM snapshot_inventory_check_system_qty(p_check_id);

  SELECT profile_id, profile_name
  INTO   v_approver_id, v_approver_name
  FROM   inventory_check_approvals
  WHERE  check_id = p_check_id
    AND  status = 'approved'
  ORDER BY step_order DESC
  LIMIT 1;

  v_approver_name := COALESCE(v_approver_name, 'System (check ' || v_check_number || ')');

  FOR v_item IN
    SELECT id, brand_variant_id, item_name, sku, system_qty, counted_qty,
           variance, variance_type
    FROM   inventory_check_items
    WHERE  check_id = p_check_id
      AND  is_counted = true
      AND  variance IS NOT NULL
      AND  variance <> 0
  LOOP
    v_variance := v_item.variance;
    v_adj_qty  := ABS(v_variance);

    IF v_variance > 0 THEN
      v_adj_type := 'increase';
    ELSIF v_item.variance_type IN ('damage', 'write_off') THEN
      v_adj_type := v_item.variance_type;
    ELSE
      v_adj_type := 'decrease';
    END IF;

    INSERT INTO public.stock_adjustments (
      warehouse_id, sub_container_id, brand_variant_id, adjustment_type, qty,
      reason, notes, photo_urls, status,
      requested_by, requested_by_name,
      source_check_id, source_check_item_id
    ) VALUES (
      v_check.warehouse_id,
      v_check.sub_container_id,   -- may be NULL on legacy checks; D.4 create RPC
                                  -- falls back to _find_or_create_sub_container.
      v_item.brand_variant_id,
      v_adj_type::public.stock_adjustment_type,
      v_adj_qty,
      'Auto-generated from inventory check ' || v_check_number,
      'Counted ' || v_item.counted_qty || ' vs system ' || v_item.system_qty
        || ' (variance ' || v_variance || ')',
      '{}'::text[],
      'pending_approval',
      v_approver_id,
      v_approver_name,
      p_check_id,
      v_item.id
    )
    RETURNING id INTO v_new_adj_id;

    v_ord := 0;
    FOR v_step IN
      SELECT step_key, step_label, is_conditional, condition_types
      FROM   approval_workflow_steps
      WHERE  workflow = 'stock_adj'
        AND  is_active = true
        AND  archived_at IS NULL
      ORDER BY step_order
    LOOP
      IF v_step.is_conditional AND NOT (v_adj_type = ANY(v_step.condition_types)) THEN
        CONTINUE;
      END IF;

      v_ord := v_ord + 1;
      INSERT INTO stock_adjustment_approvals (
        adjustment_id, step_order, step_role, step_label
      ) VALUES (
        v_new_adj_id, v_ord, v_step.step_key, v_step.step_label
      );
    END LOOP;

    IF v_ord = 0 THEN
      RAISE EXCEPTION 'No approval steps configured for stock_adj workflow — cannot auto-generate SA from check %', v_check_number;
    END IF;
  END LOOP;
END;
$function$;
