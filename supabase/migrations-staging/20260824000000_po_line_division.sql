-- Multi-division PO (Phase 1) — per-line division + denormalized header set.
--
-- Moves division from the PO header to the line: each po_line_item gets its own
-- division_id; purchase_orders.division_ids holds the distinct set (source of
-- truth for the array-aware RLS added in the next migration). An AFTER trigger
-- on po_line_items keeps division_ids current for direct edits (the create RPC
-- also sets it explicitly). Fully back-compatible: single-division POs get
-- division_ids = [division_id].

BEGIN;

ALTER TABLE public.po_line_items
  ADD COLUMN IF NOT EXISTS division_id uuid
    REFERENCES public.company_divisions(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS division_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill existing lines from their PO's header division.
UPDATE public.po_line_items li
  SET division_id = po.division_id
  FROM public.purchase_orders po
  WHERE li.po_id = po.id
    AND li.division_id IS NULL
    AND po.division_id IS NOT NULL;

-- Backfill the header set = distinct non-null line divisions.
UPDATE public.purchase_orders po
  SET division_ids = COALESCE(
    (SELECT array_agg(DISTINCT li.division_id)
       FROM public.po_line_items li
      WHERE li.po_id = po.id AND li.division_id IS NOT NULL),
    '{}'::uuid[]);

CREATE INDEX IF NOT EXISTS po_line_items_division_id_idx
  ON public.po_line_items(division_id) WHERE division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_division_ids_gin
  ON public.purchase_orders USING gin(division_ids);

COMMENT ON COLUMN public.po_line_items.division_id IS
  'The division this line is purchased for. NULL only on legacy rows.';
COMMENT ON COLUMN public.purchase_orders.division_ids IS
  'Distinct set of line divisions; source of truth for array-aware PO visibility. Kept current by trg_po_recompute_division_ids and the create RPC.';

-- Recompute purchase_orders.division_ids whenever a PO's lines change. Covers
-- direct edits to po_line_items; the create RPC also sets it directly.
CREATE OR REPLACE FUNCTION public.trg_po_recompute_division_ids()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders po
    SET division_ids = COALESCE(
      (SELECT array_agg(DISTINCT li.division_id)
         FROM public.po_line_items li
        WHERE li.po_id = v_po AND li.division_id IS NOT NULL),
      '{}'::uuid[])
    WHERE po.id = v_po;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS po_recompute_division_ids ON public.po_line_items;
CREATE TRIGGER po_recompute_division_ids
  AFTER INSERT OR UPDATE OF division_id OR DELETE ON public.po_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_recompute_division_ids();

COMMIT;

NOTIFY pgrst, 'reload schema';
