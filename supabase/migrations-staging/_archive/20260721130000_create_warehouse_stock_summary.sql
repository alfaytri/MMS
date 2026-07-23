-- ============================================================
-- Trigger-maintained stock summary table
--
-- Replaces the on-the-fly computation in warehouse_stock_view
-- (5 JOINs + GROUP BY on every query) with a pre-computed table
-- kept in sync by triggers on fifo_cost_layers and
-- warehouse_stock_allocations.
--
-- Existing code continues to work via the redefined view.
-- ============================================================

BEGIN;

-- ── 1. Create the summary table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.warehouse_stock_summary (
  warehouse_id      uuid NOT NULL,
  brand_variant_id  uuid NOT NULL,
  item_name         text,
  brand             text,
  sku               text,
  unit              text,
  qty               integer NOT NULL DEFAULT 0,
  avg_cost          numeric NOT NULL DEFAULT 0,
  total_value       numeric NOT NULL DEFAULT 0,
  category_name     text,
  subcategory_name  text,
  item_type         text,
  allocated_qty     integer NOT NULL DEFAULT 0,
  available_qty     integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, brand_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wss_brand_variant
  ON public.warehouse_stock_summary (brand_variant_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.warehouse_stock_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stock summary"
  ON public.warehouse_stock_summary
  FOR SELECT TO authenticated
  USING (true);

-- ── 3. Helper: refresh a single (warehouse, brand_variant) row ────────────

CREATE OR REPLACE FUNCTION public.refresh_stock_summary_row(
  p_warehouse_id uuid,
  p_brand_variant_id uuid
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
  IF p_warehouse_id IS NULL THEN RETURN; END IF;

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
  WHERE warehouse_id = p_warehouse_id
    AND brand_variant_id = p_brand_variant_id
    AND remaining_qty > 0;

  SELECT COALESCE(allocated_qty, 0)
  INTO v_alloc
  FROM warehouse_stock_allocations
  WHERE warehouse_id = p_warehouse_id
    AND brand_variant_id = p_brand_variant_id;

  v_alloc := COALESCE(v_alloc, 0);

  IF v_qty = 0 AND v_alloc = 0 THEN
    DELETE FROM warehouse_stock_summary
    WHERE warehouse_id = p_warehouse_id
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
  FROM inventory_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  WHERE ibv.id = p_brand_variant_id;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  ) VALUES (
    p_warehouse_id, p_brand_variant_id,
    v_item_name, v_brand, v_sku, v_unit,
    v_qty, v_avg_cost, v_total_value,
    v_category, v_subcategory, v_item_type,
    v_alloc, GREATEST(v_qty - v_alloc, 0), now()
  )
  ON CONFLICT (warehouse_id, brand_variant_id) DO UPDATE SET
    item_name      = EXCLUDED.item_name,
    brand          = EXCLUDED.brand,
    sku            = EXCLUDED.sku,
    unit           = EXCLUDED.unit,
    qty            = EXCLUDED.qty,
    avg_cost       = EXCLUDED.avg_cost,
    total_value    = EXCLUDED.total_value,
    category_name  = EXCLUDED.category_name,
    subcategory_name = EXCLUDED.subcategory_name,
    item_type      = EXCLUDED.item_type,
    allocated_qty  = EXCLUDED.allocated_qty,
    available_qty  = EXCLUDED.available_qty,
    updated_at     = EXCLUDED.updated_at;
END;
$$;

-- ── 4. Bulk refresh (initial population + manual recovery) ────────────────

CREATE OR REPLACE FUNCTION public.refresh_all_stock_summaries()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  TRUNCATE warehouse_stock_summary;

  INSERT INTO warehouse_stock_summary (
    warehouse_id, brand_variant_id,
    item_name, brand, sku, unit,
    qty, avg_cost, total_value,
    category_name, subcategory_name, item_type,
    allocated_qty, available_qty, updated_at
  )
  SELECT
    f.warehouse_id,
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
  JOIN inventory_brand_variants ibv ON ibv.id = f.brand_variant_id
  JOIN inventory_items ii ON ii.id = ibv.item_id
  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
  LEFT JOIN inventory_categories ic_parent ON ic_parent.id = ic.parent_id
  LEFT JOIN warehouse_stock_allocations wsa
    ON wsa.warehouse_id = f.warehouse_id
   AND wsa.brand_variant_id = f.brand_variant_id
  WHERE f.remaining_qty > 0
    AND f.warehouse_id IS NOT NULL
  GROUP BY
    f.warehouse_id, f.brand_variant_id,
    ii.name_en, ibv.brand, ii.sku, ii.unit,
    ic.name_en, ic.type, ic_parent.id, ic_parent.name_en, ic_parent.type,
    wsa.allocated_qty;
END;
$$;

-- ── 5. Trigger: fifo_cost_layers changes → refresh affected rows ──────────

CREATE OR REPLACE FUNCTION public.trg_fifo_refresh_stock_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fifo_stock_summary ON public.fifo_cost_layers;
CREATE TRIGGER trg_fifo_stock_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.fifo_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fifo_refresh_stock_summary();

-- ── 6. Trigger: warehouse_stock_allocations changes → refresh ─────────────

CREATE OR REPLACE FUNCTION public.trg_alloc_refresh_stock_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id);
    RETURN OLD;
  END IF;

  PERFORM refresh_stock_summary_row(NEW.warehouse_id, NEW.brand_variant_id);

  IF TG_OP = 'UPDATE'
     AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
       OR OLD.brand_variant_id IS DISTINCT FROM NEW.brand_variant_id)
  THEN
    PERFORM refresh_stock_summary_row(OLD.warehouse_id, OLD.brand_variant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alloc_stock_summary ON public.warehouse_stock_allocations;
CREATE TRIGGER trg_alloc_stock_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_stock_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_alloc_refresh_stock_summary();

-- ── 7. Initial population ─────────────────────────────────────────────────

SELECT public.refresh_all_stock_summaries();

-- ── 8. Redefine the view to read from the summary table ───────────────────
--    All existing code (.from('warehouse_stock_view')) keeps working.

CREATE OR REPLACE VIEW public.warehouse_stock_view AS
SELECT
  warehouse_id, brand_variant_id,
  item_name, brand, sku, unit,
  qty, avg_cost, total_value,
  category_name, subcategory_name, item_type,
  allocated_qty, available_qty
FROM public.warehouse_stock_summary;

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);

COMMIT;
