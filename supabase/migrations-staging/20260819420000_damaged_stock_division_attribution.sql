-- Division-attributed damaged stock — schema + backfill.
--
-- The damaged pile was tracked only per (warehouse, variant) with no division,
-- which is why damaged write-offs couldn't be scoped in the P&L. This adds a
-- division_id to the damaged layers + movements so a write-off's loss lands in
-- the division the stock was damaged in (matching the good-stock write-off).
--
-- Division is derivable at every entry point:
--   * damage stock adjustment  -> the source sub-container's division
--   * customer return -> restock_as_damaged -> the return's division
-- (both stamped by the RPC changes in the next migration).
--
-- Backfill here covers what is derivable from existing data: restock-sourced
-- layers + their movements via the return. Damage-adjustment layers created
-- before this change have no back-link and stay NULL (there are 0 write-offs
-- booked yet, so zero P&L impact; anything damaged after this attributes).

ALTER TABLE public.inventory_damaged_stock_layers
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_damaged_movements
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.company_divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_idsl_division ON public.inventory_damaged_stock_layers (division_id);
CREATE INDEX IF NOT EXISTS idx_idm_division  ON public.inventory_damaged_movements (division_id);

COMMENT ON COLUMN public.inventory_damaged_stock_layers.division_id IS
'Division the stock was damaged in (source sub-container division for damage adjustments, or the return division for restock-as-damaged). Carried onto damaged_write_off movements so the P&L Scrap line is division-scoped.';
COMMENT ON COLUMN public.inventory_damaged_movements.division_id IS
'Division this damaged movement is attributed to. For damaged_write_off it comes from the consumed layer; for restock/adjust from the entry source. NULL = legacy/unattributed (pre-2026-08-11).';

-- Backfill restock-sourced layers from the return's division.
UPDATE public.inventory_damaged_stock_layers l
SET division_id = r.division_id
FROM public.return_lines rl
JOIN public.so_po_returns r ON r.id = rl.return_id
WHERE l.source_return_line_id = rl.id
  AND l.division_id IS NULL
  AND r.division_id IS NOT NULL;

-- Backfill restock_as_damaged_in movements via their disposition -> return_line -> return.
UPDATE public.inventory_damaged_movements m
SET division_id = r.division_id
FROM public.return_line_inventory_dispositions d
JOIN public.return_lines rl ON rl.id = d.return_line_id
JOIN public.so_po_returns r ON r.id = rl.return_id
WHERE m.source_return_line_disposition_id = d.id
  AND m.division_id IS NULL
  AND r.division_id IS NOT NULL;
