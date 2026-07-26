-- ============================================================
-- debit_notes cleanup + 2 FKs
--
-- Section 1.9 of docs/next-work-plan.md. Mirrors the credit_notes
-- treatment from 20260726210000 (Section 1.5).
--
--   (a) 5 dead columns dropped:
--         approved_by   uuid  — never written or read
--         phone         text  — never written; PDF reader migrated
--                               to fetch phone via suppliers FK
--         type          text  — writers set 'manual'/'auto' but
--                               nothing filters or displays it
--         notes         text  — never written or read
--         created_by    uuid  — has FK constraint but no writer
--
--   (b) 2 FKs added, backfilled, kept in step with the existing
--       text column via a BEFORE INSERT/UPDATE trigger (for reason;
--       supplier_id has no companion text column so no sync trigger).
--
--         reason_id     uuid → reason_lists(id)
--         supplier_id   uuid → suppliers(id)
--
-- bill_id stays nullable — a PO return can happen before the bill
-- for that PO is created (usePurchaseReturns hardcodes bill_id: null
-- on auto-generated notes). Legitimate business case, not a bug.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Rewrite debit_notes_invalidate_pdf_cache_fn to remove its
--    reference to the notes column before we drop notes.
--    (Trigger fires on UPDATE and would fail with "record OLD has
--    no field notes" once notes is gone.)
--    The remaining trigger nulls pdf_url when total_amount or
--    status changes — same coverage minus notes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_notes_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pdf_url IS NOT NULL
     AND (OLD.total_amount IS DISTINCT FROM NEW.total_amount
       OR OLD.status       IS DISTINCT FROM NEW.status) THEN
    NEW.pdf_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 1. Drop the 5 dead columns
--    (drop FKs first for the ones that have them)
-- ------------------------------------------------------------
ALTER TABLE public.debit_notes
  DROP CONSTRAINT IF EXISTS debit_notes_approved_by_fkey,
  DROP CONSTRAINT IF EXISTS debit_notes_created_by_fkey;

ALTER TABLE public.debit_notes
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS created_by;

-- ------------------------------------------------------------
-- 2. Add reason_id FK
-- ------------------------------------------------------------
ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS reason_id uuid
  REFERENCES public.reason_lists(id);

-- Backfill by matching reason text against reason_lists.label.
-- Debit notes are only ever created from PO returns today, so
-- prefer category='po_return'; fall back to any category if not
-- seeded there.
UPDATE public.debit_notes dn
   SET reason_id = rl.id
  FROM public.reason_lists rl
 WHERE dn.reason_id IS NULL
   AND dn.reason    IS NOT NULL
   AND rl.deleted_at IS NULL
   AND lower(rl.label) = lower(dn.reason)
   AND rl.category = 'po_return';

UPDATE public.debit_notes dn
   SET reason_id = rl.id
  FROM public.reason_lists rl
 WHERE dn.reason_id IS NULL
   AND dn.reason    IS NOT NULL
   AND rl.deleted_at IS NULL
   AND lower(rl.label) = lower(dn.reason);

CREATE INDEX IF NOT EXISTS idx_debit_notes_reason_id
  ON public.debit_notes(reason_id);

-- ------------------------------------------------------------
-- 3. Add supplier_id FK
-- ------------------------------------------------------------
ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS supplier_id uuid
  REFERENCES public.suppliers(id);

-- Backfill via bill_id → bills.supplier_id first (most direct).
UPDATE public.debit_notes dn
   SET supplier_id = b.supplier_id
  FROM public.bills b
 WHERE dn.supplier_id IS NULL
   AND dn.bill_id IS NOT NULL
   AND b.id = dn.bill_id
   AND b.supplier_id IS NOT NULL;

-- Fallback via purchase_order_id → purchase_orders.supplier_id
-- (bill_id is often null on auto-generated debit notes).
UPDATE public.debit_notes dn
   SET supplier_id = po.supplier_id
  FROM public.purchase_orders po
 WHERE dn.supplier_id IS NULL
   AND dn.purchase_order_id IS NOT NULL
   AND po.id = dn.purchase_order_id
   AND po.supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_debit_notes_supplier_id
  ON public.debit_notes(supplier_id);

-- ------------------------------------------------------------
-- 4. Sync trigger — keep reason ↔ reason_id in step
--    (silent-fallback on unmatched, since reason text is the
--    historical snapshot; matches credit_notes behavior)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sync_debit_note_reason_id_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'po_return'
      AND deleted_at IS NULL
    LIMIT 1;
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_debit_note_reason_id ON public.debit_notes;
CREATE TRIGGER sync_debit_note_reason_id
  BEFORE INSERT OR UPDATE ON public.debit_notes
  FOR EACH ROW EXECUTE FUNCTION public._sync_debit_note_reason_id_fn();

NOTIFY pgrst, 'reload schema';

COMMIT;
