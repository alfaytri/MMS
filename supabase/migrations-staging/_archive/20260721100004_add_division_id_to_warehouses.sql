-- Migration: Add division_id directly to warehouses table
-- Reviewer feedback: "How can you separate costing and warehousing tables by divisions?
--   I don't see division relations there."
-- Previously division was inferred via warehouse_field_rps → profiles (fragile 2-hop).
-- Now warehouses own their division directly — set when creating/editing a warehouse.

-- ── Step 1: Add the column (nullable — existing rows need backfill) ──────────
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS division_id uuid;

DO $$
BEGIN
  ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_division_id_fkey
      FOREIGN KEY (division_id) REFERENCES public.company_divisions(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Step 2: Backfill from user_company_divisions (where unambiguous) ─────────
-- For each warehouse, find all Field RPs → their divisions.
-- Only assign when EVERY RP of the warehouse shares exactly ONE common division.
-- Ambiguous cases (RPs in multiple divisions, or mixed divisions) stay NULL
-- for manual assignment via the UI.
UPDATE public.warehouses w
SET    division_id = sub.single_division_id
FROM (
  SELECT
    wfr.warehouse_id,
    MIN(ucd.division_id) AS single_division_id
  FROM   public.warehouse_field_rps wfr
  JOIN   public.user_company_divisions ucd ON ucd.profile_id = wfr.profile_id
  GROUP BY wfr.warehouse_id
  HAVING COUNT(DISTINCT ucd.division_id) = 1
) sub
WHERE  w.id = sub.warehouse_id
  AND  w.division_id IS NULL;

-- ── Step 3: Fallback — warehouses with no RP or ambiguous RPs ────────────────
-- Assign the first active division so no warehouse is left without one.
-- The admin can reassign via the UI later.
UPDATE public.warehouses
SET    division_id = (
  SELECT id FROM public.company_divisions
  WHERE  is_active = true
  ORDER BY sort_order ASC
  LIMIT 1
)
WHERE division_id IS NULL;

-- ── Step 4: Now that all rows are filled, enforce NOT NULL ───────────────────
ALTER TABLE public.warehouses
  ALTER COLUMN division_id SET NOT NULL;

-- ── Step 5: Index for division-based filtering / reports ─────────────────────
CREATE INDEX IF NOT EXISTS idx_warehouses_division_id ON public.warehouses(division_id);
