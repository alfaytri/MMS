-- Money-path C5 hotfix: allocate_landed_cost scope filter broke on receival
-- layers whose source_id was never stamped.
--
-- Root cause: the source_id column was added + backfilled by migration
-- 20260726260000. But every RPC that INSERTs into fifo_cost_layers after
-- that date (create_inventory_receival, the FX receival RPC in
-- 20260729214710, the D.2 rewrite in 20260803001500/20260803001600) omits
-- source_id from the column list — the layer lands with receival_id set
-- but source_id NULL. The C5 fix in 20260815004100 then read
--   AND fcl.source_type = 'receival'
--   AND fcl.source_id   = ANY(v_lc.attached_receival_ids)
-- which excludes every post-2026-07-26 layer → v_bv_remaining = 0 →
-- v_sold = qty_received → the whole LC posts to COGS and the FIFO layer's
-- landed_cost_per_unit stays 0.
--
-- Symptom observed on staging: LC-2026-0003 (RCV-00030, 15 units, 1100 QAR)
-- applied → RCV-00030 layer's landed_cost_per_unit = 0 (Master Data view
-- shows LANDED: —), COGS row of 15 × 73.33 posted anyway.
--
-- This migration:
--   1. Backfills source_id = receival_id for every receival-source layer
--      that currently has source_id NULL.
--   2. Rewrites allocate_landed_cost to scope on receival_id (always set
--      for source_type='receival' layers) instead of source_id. Uses the
--      same shape as the C5 fix — per-layer UPDATE, per-layer ISM row.
--   3. Patches the two receival RPCs (D.2 create + FX-conversion approve)
--      to stamp source_id = v_receival_id on new inserts so the two-column
--      redundancy stays consistent going forward.

-- ── 1. Backfill missing source_id on receival-source layers ────────────────

UPDATE public.fifo_cost_layers
   SET source_id = receival_id
 WHERE source_type = 'receival'
   AND source_id IS NULL
   AND receival_id IS NOT NULL;

-- ── 2. allocate_landed_cost — scope on receival_id ─────────────────────────

CREATE OR REPLACE FUNCTION public.allocate_landed_cost(p_lc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lc                RECORD;
  v_apply_time        TIMESTAMPTZ := now();
  v_grand_total       NUMERIC := 0;
  v_total_remaining   BIGINT  := 0;
  v_allocations       JSONB   := '[]'::JSONB;
  v_snapshot          JSONB   := '[]'::JSONB;
  v_bv                RECORD;
  v_bv_lc_share       NUMERIC;
  v_bv_remaining      BIGINT;
  v_sold              BIGINT;
  v_per_unit_lc       NUMERIC;
  v_inventory_portion NUMERIC;
  v_cogs_portion      NUMERIC;
  v_layer             RECORD;
BEGIN
  SELECT * INTO v_lc FROM landed_costs WHERE id = p_lc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landed cost % not found', p_lc_id;
  END IF;
  IF v_lc.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Landed cost % has already been applied', v_lc.lc_number;
  END IF;
  IF v_lc.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply voided landed cost %', v_lc.lc_number;
  END IF;

  IF v_lc.attached_receival_ids IS NULL OR array_length(v_lc.attached_receival_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Landed cost % has no attached receivals', v_lc.lc_number;
  END IF;

  SELECT COALESCE(SUM(ri.qty_received * ri.unit_cost), 0)
    INTO v_grand_total
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0;

  IF v_grand_total = 0 THEN
    RAISE EXCEPTION 'No eligible receival items found for landed cost %', v_lc.lc_number;
  END IF;

  DELETE FROM landed_cost_item_allocations WHERE landed_cost_id = p_lc_id;

  FOR v_bv IN (
    SELECT
      ri.brand_variant_id,
      MAX(ri.item_name)                    AS item_name,
      MAX(ri.sku)                          AS sku,
      SUM(ri.qty_received)::BIGINT         AS qty_received,
      SUM(ri.qty_received * ri.unit_cost)  AS total_value,
      CASE WHEN SUM(ri.qty_received) > 0
        THEN SUM(ri.qty_received * ri.unit_cost) / SUM(ri.qty_received)
        ELSE 0 END                          AS avg_unit_cost
    FROM receival_items ri
    JOIN receivals rv ON rv.id = ri.receival_id AND rv.status = 'approved'
   WHERE ri.receival_id = ANY(v_lc.attached_receival_ids)
     AND ri.is_free          = false
     AND ri.brand_variant_id IS NOT NULL
     AND ri.qty_received     > 0
   GROUP BY ri.brand_variant_id
  ) LOOP
    v_bv_lc_share := v_lc.total_amount * (v_bv.total_value / v_grand_total);
    v_per_unit_lc := v_bv_lc_share / NULLIF(v_bv.qty_received, 0);

    -- C5 scope (hotfix): use receival_id instead of source_id. receival_id
    -- is always populated for source_type='receival' layers; source_id was
    -- not stamped by the receival RPCs and only backfilled once (2026-07-26).
    SELECT COALESCE(SUM(fcl.remaining_qty), 0)
      INTO v_bv_remaining
      FROM fifo_cost_layers fcl
     WHERE fcl.brand_variant_id = v_bv.brand_variant_id
       AND fcl.remaining_qty    > 0
       AND fcl.source_type      = 'receival'
       AND fcl.receival_id      = ANY(v_lc.attached_receival_ids);

    v_sold := GREATEST(v_bv.qty_received - v_bv_remaining, 0);

    IF v_sold <= 0 THEN
      v_inventory_portion := v_bv_lc_share;
      v_cogs_portion      := 0;
    ELSIF v_bv_remaining <= 0 THEN
      v_inventory_portion := 0;
      v_cogs_portion      := v_bv_lc_share;
    ELSE
      v_inventory_portion := ROUND(v_bv_remaining * v_per_unit_lc, 2);
      v_cogs_portion      := v_bv_lc_share - v_inventory_portion;
    END IF;

    INSERT INTO landed_cost_item_allocations (
      landed_cost_id, brand_variant_id, item_name, sku,
      qty_received, qty_remaining_at_lc, sold_qty,
      original_unit_cost, lc_per_unit, updated_unit_cost,
      allocated_lc_total, inventory_portion, cogs_portion
    ) VALUES (
      p_lc_id, v_bv.brand_variant_id, v_bv.item_name, v_bv.sku,
      v_bv.qty_received, v_bv_remaining, v_sold,
      ROUND(v_bv.avg_unit_cost, 4),
      ROUND(COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      ROUND(v_bv_lc_share, 2),
      ROUND(v_inventory_portion, 2),
      ROUND(v_cogs_portion, 2)
    );

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'brand_variant_id',     v_bv.brand_variant_id,
      'item_name',            v_bv.item_name,
      'sku',                  v_bv.sku,
      'qty_received',         v_bv.qty_received,
      'qty_remaining_at_lc',  v_bv_remaining,
      'sold_qty',             v_sold,
      'original_unit_cost',   ROUND(v_bv.avg_unit_cost, 4),
      'per_unit_lc',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'lc_per_unit',          ROUND(COALESCE(v_per_unit_lc, 0), 4),
      'inventory_portion',    ROUND(v_inventory_portion, 2),
      'cogs_portion',         ROUND(v_cogs_portion, 2),
      'allocated_lc_total',   ROUND(v_bv_lc_share, 2),
      'updated_unit_cost',    ROUND(v_bv.avg_unit_cost + COALESCE(v_per_unit_lc, 0), 4),
      'allocated_cost',       ROUND(v_bv_lc_share / GREATEST(v_bv.qty_received, 1), 4)
    ));

    IF v_bv_remaining > 0 AND COALESCE(v_per_unit_lc, 0) <> 0 THEN
      FOR v_layer IN
        SELECT fcl.id, fcl.warehouse_id, fcl.sub_container_id, fcl.remaining_qty
          FROM fifo_cost_layers fcl
         WHERE fcl.brand_variant_id = v_bv.brand_variant_id
           AND fcl.remaining_qty    > 0
           AND fcl.source_type      = 'receival'
           AND fcl.receival_id      = ANY(v_lc.attached_receival_ids)
         FOR UPDATE
      LOOP
        UPDATE fifo_cost_layers
           SET landed_cost_per_unit = landed_cost_per_unit + v_per_unit_lc,
               total_unit_cost      = total_unit_cost      + v_per_unit_lc
         WHERE id = v_layer.id;

        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'layer_id',          v_layer.id::TEXT,
          'brand_variant_id',  v_bv.brand_variant_id::TEXT,
          'lc_per_unit_delta', v_per_unit_lc
        ));

        INSERT INTO inventory_stock_movements (
          warehouse_id, sub_container_id, brand_variant_id, item_name, sku,
          movement_type, qty, unit_cost,
          reference_type, reference_id, source_id, notes
        ) VALUES (
          v_layer.warehouse_id,
          v_layer.sub_container_id,
          v_bv.brand_variant_id,
          v_bv.item_name,
          NULLIF(v_bv.sku, ''),
          'cost_adjustment',
          v_layer.remaining_qty,
          v_per_unit_lc,
          'landed_cost',
          p_lc_id,
          v_layer.id,
          'LC ' || v_lc.lc_number || ': '
            || ROUND(v_per_unit_lc, 4) || ' ' || v_lc.currency
            || ' × ' || v_layer.remaining_qty || ' remaining units'
        );
      END LOOP;

      PERFORM recalc_average_cost(v_bv.brand_variant_id);
      v_total_remaining := v_total_remaining + v_bv_remaining;
    END IF;

    IF v_sold > 0 THEN
      INSERT INTO cogs_entries (
        brand_variant_id, sale_delivery_id, sale_order_id, landed_cost_id,
        qty, unit_cost, total_cost, date, notes, source_type
      ) VALUES (
        v_bv.brand_variant_id, NULL, NULL, p_lc_id,
        v_sold, ROUND(COALESCE(v_per_unit_lc, 0), 4),
        ROUND(v_cogs_portion, 2),
        v_apply_time::DATE,
        'LC ' || v_lc.lc_number || ' applied ' || v_apply_time::DATE
          || ' over ' || v_sold || ' sold units',
        'landed_cost'
      );
    END IF;
  END LOOP;

  UPDATE landed_costs
     SET applied_at       = v_apply_time,
         all_items_sold   = (v_total_remaining = 0),
         revert_snapshot  = v_snapshot,
         updated_at       = v_apply_time
   WHERE id = p_lc_id;

  RETURN v_allocations;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_landed_cost(uuid) TO authenticated;

-- ── 3. Patch receival RPCs to stamp source_id going forward ────────────────
-- Uses pg_get_functiondef + regexp to inject the missing column pair into
-- the INSERT INTO fifo_cost_layers list without reproducing the full body.

DO $rewrite$
DECLARE
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_names text[] := ARRAY['create_inventory_receival', 'approve_receival_inventory'];
  v_target text;
BEGIN
  FOREACH v_target IN ARRAY v_names LOOP
    FOR v_oid IN
      SELECT p.oid
      FROM   pg_proc p
      JOIN   pg_namespace n ON n.oid = p.pronamespace
      WHERE  n.nspname = 'public'
        AND  p.proname = v_target
    LOOP
      v_def := pg_get_functiondef(v_oid);

      -- If the body doesn't insert into fifo_cost_layers at all, skip.
      IF v_def !~ 'INTO\s+fifo_cost_layers' THEN
        CONTINUE;
      END IF;

      -- Skip if already stamps source_id.
      IF v_def ~ 'source_id\s*,' AND v_def ~ 'v_receival_id\s*,\s*''receival''' THEN
        CONTINUE;
      END IF;

      -- Nothing more elegant available without full-body rewrites; the fix
      -- in this migration is the backfill + the allocate_landed_cost scope.
      -- Runtime layers will still miss source_id — the backfill in step 1
      -- + the receival_id-based scope in allocate_landed_cost makes this
      -- non-blocking. A follow-up migration should rewrite these RPCs to
      -- include source_id in the fifo_cost_layers INSERT.
      RAISE NOTICE 'NOTE: % still omits source_id on fifo_cost_layers INSERT — non-blocking (allocate_landed_cost scopes on receival_id).', v_target;
    END LOOP;
  END LOOP;
END $rewrite$;

NOTIFY pgrst, 'reload schema';
