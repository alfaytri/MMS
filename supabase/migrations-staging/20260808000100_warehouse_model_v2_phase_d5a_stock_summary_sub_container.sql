-- Warehouse Model v2 — Phase D.5.a
-- Extend `warehouse_stock_summary` PK to include `sub_container_id`.
-- Rewrite the two refresh RPCs and the two triggers so writes key on
-- the triple; drop + recreate `warehouse_stock_view` to expose the new
-- column. Repopulate cleanly at the end.
--
-- Live bodies of the existing refresh_stock_summary_row,
-- refresh_all_stock_summaries, trg_fifo_refresh_stock_summary, and
-- trg_alloc_refresh_stock_summary were sourced 2026-08-01 via
-- pg_get_functiondef and used as the base; the deltas are:
--   * new p_sub_container_id arg on refresh_stock_summary_row
--   * per-row lookup + INSERT columns include sub_container_id
--   * refresh_all_stock_summaries GROUP BY adds f.sub_container_id
--   * triggers pass NEW/OLD.sub_container_id to the refresh helper
--
-- The view swap uses DROP + CREATE because `CREATE OR REPLACE VIEW`
-- forbids adding columns. Everything runs in a single transaction so the
-- window in which the view is missing is atomic.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Drop dependent triggers + old refresh RPCs
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_fifo_stock_summary  ON public.fifo_cost_layers;
DROP TRIGGER IF EXISTS trg_alloc_stock_summary ON public.warehouse_stock_allocations;

DROP FUNCTION IF EXISTS public.refresh_stock_summary_row(uuid, uuid);
DROP FUNCTION IF EXISTS public.refresh_all_stock_summaries();
DROP FUNCTION IF EXISTS public.trg_fifo_refresh_stock_summary();
DROP FUNCTION IF EXISTS public.trg_alloc_refresh_stock_summary();

-- ─────────────────────────────────────────────────────────────────────
-- 2. Expand warehouse_stock_summary PK
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.warehouse_stock_summary
  DROP CONSTRAINT warehouse_stock_summary_pkey;

ALTER TABLE public.warehouse_stock_summary
  ADD COLUMN sub_container_id uuid;

-- Populate sub_container_id from the earliest live FIFO layer for that
-- (warehouse, brand_variant). Rows whose stock has been fully drained
-- won't match and get cleaned up below.
UPDATE public.warehouse_stock_summary wss
SET sub_container_id = (
  SELECT sub_container_id
  FROM   public.fifo_cost_layers fcl
  WHERE  fcl.warehouse_id     = wss.warehouse_id
    AND  fcl.brand_variant_id = wss.brand_variant_id
    AND  fcl.remaining_qty    > 0
    AND  fcl.sub_container_id IS NOT NULL
  ORDER BY fcl.created_at ASC
  LIMIT  1
);

-- Any row that has no live layer becomes an orphan — the refresh loop
-- would have deleted it anyway on the next relevant write. Drop them
-- now so the SET NOT NULL succeeds.
DELETE FROM public.warehouse_stock_summary WHERE sub_container_id IS NULL;

ALTER TABLE public.warehouse_stock_summary
  ALTER COLUMN sub_container_id SET NOT NULL;

ALTER TABLE public.warehouse_stock_summary
  ADD CONSTRAINT warehouse_stock_summary_sub_container_fk
  FOREIGN KEY (sub_container_id)
  REFERENCES public.warehouse_sub_containers(id)
  ON DELETE RESTRICT;

ALTER TABLE public.warehouse_stock_summary
  ADD PRIMARY KEY (warehouse_id, sub_container_id, brand_variant_id);

CREATE INDEX IF NOT EXISTS idx_wss_sub_container
  ON public.warehouse_stock_summary(sub_container_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. refresh_stock_summary_row (3-arg)
-- ─────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.refresh_stock_summary_row(
  p_warehouse_id     uuid,
  p_brand_variant_id uuid,
  p_sub_container_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_qty         integer;
  v_avg_cost    numeric;
  v_total_value numeric;
  v_alloc       integer;
  v_item_name   text;
  v_brand       text;
  v_sku         text;
  v_unit        text;
  v_category    text;
  v_subcategory text;
  v_item_type   text;
BEGIN
  IF p_warehouse_id IS NULL OR p_sub_container_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(remaining_qty), 0)::integer,
    CASE WHEN SUM(remaining_qty) > 0
      THEN SUM(remaining_qty::numeric * total_unit_cost)
           / SUM(remaining_qty)::numeric
      ELSE 0
    END,
    COALESCE(SUM(remaining_qty::numeric * total_unit_cost), 0)
  INTO v_qty, v_avg_cost, v_total_value
  FROM fifo_cost_layers
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id
    AND remaining_qty    > 0;

  SELECT COALESCE(allocated_qty, 0)
  INTO v_alloc
  FROM warehouse_stock_allocations
  WHERE warehouse_id     = p_warehouse_id
    AND sub_container_id = p_sub_container_id
    AND brand_variant_id = p_brand_variant_id;

  v_alloc := COALESCE(v_alloc, 0);

  IF v_qty = 0 AND v_alloc = 0 THEN
    DELETE FROM warehouse_stock_summary
    WHERE warehouse_id     = p_warehouse_id
      AND sub_container_id = p_sub_container_id
      AND brand_variant_id = p_brand_variant_id;
    RETURN;
  END IF;

  SELECT
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text
  INTO v_item_name, v_brand, v_sku, v_unit,
       v_category, v_subcategory, v_item_type
  FROM inventory_item_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  WHERE ibv.id = p_brand_variant_id;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  ) VALUES (
    p_warehouse_id, p_sub_container_id, p_brand_variant_id,
    v_item_name, v_brand, v_sku, v_unit,
    v_qty, v_avg_cost, v_total_value,
    v_category, v_subcategory, v_item_type,
    v_alloc, GREATEST(v_qty - v_alloc, 0), now()
  )
  ON CONFLICT (warehouse_id, sub_container_id, brand_variant_id) DO UPDATE SET
    item_name        = EXCLUDED.item_name,
    brand            = EXCLUDED.brand,
    sku              = EXCLUDED.sku,
    unit             = EXCLUDED.unit,
    qty              = EXCLUDED.qty,
    avg_cost         = EXCLUDED.avg_cost,
    total_value      = EXCLUDED.total_value,
    category_name    = EXCLUDED.category_name,
    subcategory_name = EXCLUDED.subcategory_name,
    item_type        = EXCLUDED.item_type,
    allocated_qty    = EXCLUDED.allocated_qty,
    available_qty    = EXCLUDED.available_qty,
    updated_at       = EXCLUDED.updated_at;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. refresh_all_stock_summaries (bulk repopulate)
-- ─────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.refresh_all_stock_summaries()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  TRUNCATE warehouse_stock_summary;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, sub_container_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  )
  SELECT
    f.warehouse_id,
    f.sub_container_id,
    f.brand_variant_id,
    ii.name_en,
    ibv.brand,
    ii.sku,
    ii.unit,
    SUM(f.remaining_qty)::integer,
    CASE WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty::numeric * f.total_unit_cost)
           / SUM(f.remaining_qty)::numeric
      ELSE 0
    END,
    SUM(f.remaining_qty::numeric * f.total_unit_cost),
    COALESCE(ic_parent.name_en, ic.name_en),
    CASE WHEN ic_parent.id IS NOT NULL THEN ic.name_en END,
    COALESCE(ic.type, ic_parent.type)::text,
    COALESCE(wsa.allocated_qty, 0),
    GREATEST(SUM(f.remaining_qty)::integer - COALESCE(wsa.allocated_qty, 0), 0),
    now()
  FROM fifo_cost_layers f
  JOIN inventory_item_brand_variants ibv ON ibv.id = f.brand_variant_id
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  LEFT JOIN warehouse_stock_allocations wsa
    ON wsa.warehouse_id     = f.warehouse_id
   AND wsa.sub_container_id = f.sub_container_id
   AND wsa.brand_variant_id = f.brand_variant_id
  WHERE f.remaining_qty     > 0
    AND f.warehouse_id     IS NOT NULL
    AND f.sub_container_id IS NOT NULL
  GROUP BY
    f.warehouse_id, f.sub_container_id, f.brand_variant_id,
    ii.name_en, ibv.brand, ii.sku, ii.unit,
    ic.name_en, ic.type, ic_parent.id, ic_parent.name_en, ic_parent.type,
    wsa.allocated_qty;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Triggers — carry sub_container_id through to the refresh helper
-- ─────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.trg_fifo_refresh_stock_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fifo_stock_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.fifo_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fifo_refresh_stock_summary();

CREATE FUNCTION public.trg_alloc_refresh_stock_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id, NEW.sub_container_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id     IS DISTINCT FROM NEW.warehouse_id
       OR OLD.sub_container_id IS DISTINCT FROM NEW.sub_container_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id, OLD.sub_container_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alloc_stock_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_stock_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_alloc_refresh_stock_summary();

-- ─────────────────────────────────────────────────────────────────────
-- 6. warehouse_stock_view — DROP + CREATE (CREATE OR REPLACE forbids
--    appending columns)
-- ─────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.warehouse_stock_view;

CREATE VIEW public.warehouse_stock_view AS
SELECT
  warehouse_id, sub_container_id, brand_variant_id,
  item_name, brand, sku, unit,
  qty, avg_cost, total_value,
  category_name, subcategory_name, item_type,
  allocated_qty, available_qty
FROM public.warehouse_stock_summary;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────
-- 7. Repopulate from the triple aggregation
-- ─────────────────────────────────────────────────────────────────────
SELECT public.refresh_all_stock_summaries();

COMMIT;
