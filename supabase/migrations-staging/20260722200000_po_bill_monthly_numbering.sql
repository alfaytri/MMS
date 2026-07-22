-- ============================================================================
-- PO / Bill numbering rework
-- ============================================================================
-- New scheme:
--   • PO number: PO-YYYY-MM-NNN — 3-digit counter resets each month.
--   • Bill number: <PO number>-B — no counter (enforced 1 PO = 1 bill).
--
-- This migration:
--   1. Verifies no PO currently has >1 bill (fails loudly if any do — needs
--      manual reconciliation before we can add the UNIQUE constraint).
--   2. Adds UNIQUE(purchase_order_id) on bills so the DB enforces 1:1.
--   3. Renumbers existing POs (2 rows in staging today) using
--      ROW_NUMBER() partitioned by year+month of created_at.
--   4. Renames existing bill numbers to <new PO number>-B.
--   5. Replaces next_po_number() with a monthly-reset version using an
--      advisory lock keyed by year+month for concurrency safety.
--   6. Drops the now-unused po_number_seq sequence.
--   7. Clears cached PDF URLs on bills / receivals / returns so future
--      renders pick up the new numbers.
-- ============================================================================

BEGIN;

-- ── 1. Pre-flight: fail if any PO has multiple bills ───────────────────────

DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT purchase_order_id
    FROM   public.bills
    WHERE  purchase_order_id IS NOT NULL
    GROUP  BY purchase_order_id
    HAVING COUNT(*) > 1
  ) x;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Refusing to migrate: % PO(s) have more than one bill. Reconcile before applying.', v_dups;
  END IF;
END $$;

-- ── 2. Enforce 1 PO = 1 bill ───────────────────────────────────────────────

ALTER TABLE public.bills
  ADD CONSTRAINT bills_purchase_order_id_unique UNIQUE (purchase_order_id);

-- ── 3. Renumber existing POs to PO-YYYY-MM-NNN ─────────────────────────────

WITH ranked AS (
  SELECT
    id,
    'PO-' || TO_CHAR(created_at, 'YYYY-MM') || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY DATE_TRUNC('month', created_at)
          ORDER BY created_at, id
        )::TEXT,
        3, '0'
      ) AS new_po_number
  FROM public.purchase_orders
  WHERE po_number ~ '^PO-[0-9]+$'  -- only old-format numbers
)
UPDATE public.purchase_orders p
SET    po_number = r.new_po_number
FROM   ranked r
WHERE  p.id = r.id;

-- ── 4. Rename existing bill numbers to <new PO number>-B ───────────────────

UPDATE public.bills b
SET    bill_number = p.po_number || '-B'
FROM   public.purchase_orders p
WHERE  b.purchase_order_id = p.id;

-- ── 5. Replace next_po_number() with the monthly-reset version ─────────────

CREATE OR REPLACE FUNCTION public.next_po_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year   TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month  TEXT := TO_CHAR(CURRENT_DATE, 'MM');
  v_prefix TEXT := 'PO-' || v_year || '-' || v_month || '-';
  v_next   INT;
BEGIN
  -- Serialize concurrent creates within the same year+month.
  PERFORM pg_advisory_xact_lock(hashtext('po_number_' || v_year || v_month));

  SELECT COUNT(*) + 1 INTO v_next
  FROM   public.purchase_orders
  WHERE  po_number LIKE v_prefix || '%';

  RETURN v_prefix || LPAD(v_next::TEXT, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.next_po_number() TO authenticated;

-- ── 6. Drop the now-unused sequence ────────────────────────────────────────

DROP SEQUENCE IF EXISTS public.po_number_seq;

-- ── 7. Clear cached PDF URLs on rows that display these numbers ────────────

UPDATE public.bills      SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.receivals
   SET receipt_pdf_url = NULL, check_sheet_pdf_url = NULL
 WHERE receipt_pdf_url IS NOT NULL OR check_sheet_pdf_url IS NOT NULL;
UPDATE public.returns    SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

COMMIT;
