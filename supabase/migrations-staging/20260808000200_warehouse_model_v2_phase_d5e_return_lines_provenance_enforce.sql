-- Warehouse Model v2 — Phase D.5.e
-- Enforce that every `return_lines` row carries the correct provenance FK
-- for its parent so_po_returns.source_type:
--   * source_type='purchase_order'  → receival_item_id       IS NOT NULL
--   * source_type='sale_order'      → sale_delivery_line_id  IS NOT NULL
--
-- Enforcement lives in a BEFORE INSERT/UPDATE trigger because a CHECK
-- constraint cannot cross-reference the parent table's source_type. A
-- companion CHECK guards the "no provenance at all" degenerate case cheaply
-- at the row level.
--
-- The app layer has enforced this since D.4.a (PO returns) and D.4.b (SO
-- returns) via mutation validators. DB survey at plan-write returned
-- 0 truly-orphan rows and 0 per-source violations, so no backfill is
-- needed and the preflight assert exists purely as a race guard.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Preflight: fail cleanly if a row appeared between the D.5 survey
--    and this migration
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_bad INT;
BEGIN
  SELECT count(*) INTO v_bad
  FROM   public.return_lines rl
  JOIN   public.so_po_returns spr ON spr.id = rl.return_id
  WHERE  (spr.source_type = 'purchase_order' AND rl.receival_item_id       IS NULL)
     OR  (spr.source_type = 'sale_order'     AND rl.sale_delivery_line_id IS NULL);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Refusing to enforce provenance: % return_lines still have NULL provenance for their source_type. Backfill first.',
      v_bad
      USING HINT = 'grep return_id values from the survey query in this migration and reconcile manually before re-applying.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Cheap row-level CHECK: at least one provenance FK is populated
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.return_lines
  DROP CONSTRAINT IF EXISTS return_lines_provenance_required;

ALTER TABLE public.return_lines
  ADD  CONSTRAINT return_lines_provenance_required
  CHECK (
    receival_item_id       IS NOT NULL
    OR sale_delivery_line_id IS NOT NULL
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. Per-source enforcement trigger (CHECK cannot cross tables)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._enforce_return_line_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_source public.return_source_type;
BEGIN
  SELECT source_type INTO v_source
  FROM   public.so_po_returns
  WHERE  id = NEW.return_id;

  IF v_source = 'purchase_order' AND NEW.receival_item_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.receival_item_id is required for PO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every PO-return line must reference the receival_items row it originated from — D.4.a rule.';
  END IF;

  IF v_source = 'sale_order' AND NEW.sale_delivery_line_id IS NULL THEN
    RAISE EXCEPTION 'return_lines.sale_delivery_line_id is required for SO returns (return_id=%)', NEW.return_id
      USING HINT = 'Every SO-return line must reference the sale_delivery_lines row it originated from — D.4.b rule.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_lines_provenance ON public.return_lines;
CREATE TRIGGER trg_return_lines_provenance
  BEFORE INSERT OR UPDATE OF receival_item_id, sale_delivery_line_id, return_id
  ON public.return_lines
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_return_line_provenance();
