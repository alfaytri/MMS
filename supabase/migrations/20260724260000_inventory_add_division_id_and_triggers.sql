-- Inventory division denormalization — Phase 1.
--
-- Adds division_id to 6 inventory-domain tables so per-division reports,
-- RLS, and audit trails don't need to JOIN warehouses every time. Every
-- new row auto-populates division_id via BEFORE INSERT triggers; the
-- backfill at the bottom fills every existing row where a division can
-- be resolved.
--
-- Nullable at first — Phase 3 tightens to NOT NULL after backfill is
-- verified. See docs/specs/2026-07-24-inventory-division-denormalization-plan.md
-- for the full plan.

BEGIN;

-- ─── 1. Add columns + indexes ───────────────────────────────────────────

ALTER TABLE public.receivals
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_receivals_division_id
  ON public.receivals(division_id) WHERE division_id IS NOT NULL;

ALTER TABLE public.receival_items
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_receival_items_division_id
  ON public.receival_items(division_id) WHERE division_id IS NOT NULL;

ALTER TABLE public.fifo_cost_layers
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_fifo_cost_layers_division_id
  ON public.fifo_cost_layers(division_id) WHERE division_id IS NOT NULL;

ALTER TABLE public.inventory_stock_movements
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_movements_division_id
  ON public.inventory_stock_movements(division_id) WHERE division_id IS NOT NULL;

ALTER TABLE public.cogs_entries
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_cogs_entries_division_id
  ON public.cogs_entries(division_id) WHERE division_id IS NOT NULL;

ALTER TABLE public.warehouse_transfers
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_division_id
  ON public.warehouse_transfers(division_id) WHERE division_id IS NOT NULL;

-- ─── 2. Trigger functions — auto-derive division_id on insert ──────────

-- Pattern: only set NEW.division_id if the caller didn't already provide
-- one. This preserves backward-compat for any code that already sets it.

CREATE OR REPLACE FUNCTION public.set_division_from_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.warehouse_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.warehouses WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_division_from_receival()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.receival_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.receivals WHERE id = NEW.receival_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_division_from_sale_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.sale_order_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.sale_orders WHERE id = NEW.sale_order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_division_from_from_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.division_id IS NULL AND NEW.from_warehouse_id IS NOT NULL THEN
    SELECT division_id INTO NEW.division_id
    FROM public.warehouses WHERE id = NEW.from_warehouse_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Attach triggers ─────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_receivals_set_division ON public.receivals;
CREATE TRIGGER trg_receivals_set_division
BEFORE INSERT ON public.receivals
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_warehouse();

DROP TRIGGER IF EXISTS trg_receival_items_set_division ON public.receival_items;
CREATE TRIGGER trg_receival_items_set_division
BEFORE INSERT ON public.receival_items
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_receival();

DROP TRIGGER IF EXISTS trg_fifo_cost_layers_set_division ON public.fifo_cost_layers;
CREATE TRIGGER trg_fifo_cost_layers_set_division
BEFORE INSERT ON public.fifo_cost_layers
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_warehouse();

DROP TRIGGER IF EXISTS trg_inventory_stock_movements_set_division ON public.inventory_stock_movements;
CREATE TRIGGER trg_inventory_stock_movements_set_division
BEFORE INSERT ON public.inventory_stock_movements
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_warehouse();

DROP TRIGGER IF EXISTS trg_cogs_entries_set_division ON public.cogs_entries;
CREATE TRIGGER trg_cogs_entries_set_division
BEFORE INSERT ON public.cogs_entries
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_sale_order();

DROP TRIGGER IF EXISTS trg_warehouse_transfers_set_division ON public.warehouse_transfers;
CREATE TRIGGER trg_warehouse_transfers_set_division
BEFORE INSERT ON public.warehouse_transfers
FOR EACH ROW EXECUTE FUNCTION public.set_division_from_from_warehouse();

-- ─── 4. Backfill existing rows ──────────────────────────────────────────

UPDATE public.receivals r
SET    division_id = w.division_id
FROM   public.warehouses w
WHERE  w.id = r.warehouse_id
  AND  r.division_id IS NULL;

UPDATE public.receival_items ri
SET    division_id = r.division_id
FROM   public.receivals r
WHERE  r.id = ri.receival_id
  AND  ri.division_id IS NULL;

UPDATE public.fifo_cost_layers fcl
SET    division_id = w.division_id
FROM   public.warehouses w
WHERE  w.id = fcl.warehouse_id
  AND  fcl.division_id IS NULL;

UPDATE public.inventory_stock_movements ism
SET    division_id = w.division_id
FROM   public.warehouses w
WHERE  w.id = ism.warehouse_id
  AND  ism.division_id IS NULL;

UPDATE public.cogs_entries ce
SET    division_id = so.division_id
FROM   public.sale_orders so
WHERE  so.id = ce.sale_order_id
  AND  ce.division_id IS NULL;

UPDATE public.warehouse_transfers wt
SET    division_id = w.division_id
FROM   public.warehouses w
WHERE  w.id = wt.from_warehouse_id
  AND  wt.division_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
