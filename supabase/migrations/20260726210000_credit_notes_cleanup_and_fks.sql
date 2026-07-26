-- ============================================================
-- credit_notes cleanup + 3 FKs
--
-- Section 1.5 of docs/next-work-plan.md. Two concerns bundled:
--
--   (a) 5 dead columns dropped:
--         approved_by   text  — never written or read anywhere
--         phone         text  — never written; PDF reader migrated
--                               to fetch phone via customer FK
--         type          text  — writers set 'manual'/'auto'/'full'
--                               but nothing filters or displays it
--         notes         text  — never written or read
--         created_by    uuid  — has FK constraint but no writer
--
--   (b) 3 FKs added, backfilled, and kept in sync with the
--       existing text columns via BEFORE INSERT/UPDATE triggers
--       (mirrors Pass 2c pattern from 20260726030000):
--
--         reason_id         uuid → reason_lists(id)
--         customer_id       uuid → customers(id)
--         refund_method_id  uuid → payment_methods(id)
--
-- All 3 FKs are nullable — existing rows may not resolve if the
-- reason text has no matching label, customer chain returns NULL
-- (return without invoice AND no source SO), or the refund_method
-- slug is unrecognized. Sync triggers keep new writes aligned
-- either way so app code can keep writing the text columns; a
-- follow-up will migrate writers to write the FKs directly.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the 5 dead columns
-- ------------------------------------------------------------
ALTER TABLE public.credit_notes
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS created_by;

-- ------------------------------------------------------------
-- 2. Add reason_id FK
-- ------------------------------------------------------------
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS reason_id uuid
  REFERENCES public.reason_lists(id);

-- Backfill by matching reason text against reason_lists.label.
-- We prefer sale_return category first (that's the only category
-- credit_notes are ever created from today), falling back to any
-- match if the reason wasn't seeded in sale_return.
UPDATE public.credit_notes cn
   SET reason_id = rl.id
  FROM public.reason_lists rl
 WHERE cn.reason_id IS NULL
   AND cn.reason    IS NOT NULL
   AND rl.deleted_at IS NULL
   AND lower(rl.label) = lower(cn.reason)
   AND rl.category = 'sale_return';

UPDATE public.credit_notes cn
   SET reason_id = rl.id
  FROM public.reason_lists rl
 WHERE cn.reason_id IS NULL
   AND cn.reason    IS NOT NULL
   AND rl.deleted_at IS NULL
   AND lower(rl.label) = lower(cn.reason);

CREATE INDEX IF NOT EXISTS idx_credit_notes_reason_id
  ON public.credit_notes(reason_id);

-- ------------------------------------------------------------
-- 3. Add customer_id FK
-- ------------------------------------------------------------
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS customer_id uuid
  REFERENCES public.customers(id);

-- Backfill via invoice → so_invoices.customer_id first.
UPDATE public.credit_notes cn
   SET customer_id = si.customer_id
  FROM public.so_invoices si
 WHERE cn.customer_id IS NULL
   AND cn.invoice_id IS NOT NULL
   AND si.id = cn.invoice_id
   AND si.customer_id IS NOT NULL;

-- Fallback via source_return_id → so_po_returns → sale_orders.customer_id.
UPDATE public.credit_notes cn
   SET customer_id = so.customer_id
  FROM public.so_po_returns r
  JOIN public.sale_orders so ON so.id = r.source_id
 WHERE cn.customer_id IS NULL
   AND cn.source_return_id IS NOT NULL
   AND r.id = cn.source_return_id
   AND r.source_type = 'sale_order'
   AND so.customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_id
  ON public.credit_notes(customer_id);

-- ------------------------------------------------------------
-- 4. Add refund_method_id FK
-- ------------------------------------------------------------
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS refund_method_id uuid
  REFERENCES public.payment_methods(id);

-- Backfill by matching refund_method text against payment_methods.slug.
UPDATE public.credit_notes cn
   SET refund_method_id = pm.id
  FROM public.payment_methods pm
 WHERE cn.refund_method_id IS NULL
   AND cn.refund_method    IS NOT NULL
   AND pm.slug = cn.refund_method;

CREATE INDEX IF NOT EXISTS idx_credit_notes_refund_method_id
  ON public.credit_notes(refund_method_id);

-- ------------------------------------------------------------
-- 5. Sync triggers — keep text ↔ FK in step, both directions
-- ------------------------------------------------------------

-- 5a. reason_id ↔ reason (via reason_lists.label + category='sale_return')
CREATE OR REPLACE FUNCTION public._sync_credit_note_reason_id_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reason_id IS NULL AND NEW.reason IS NOT NULL THEN
    SELECT id INTO NEW.reason_id
    FROM public.reason_lists
    WHERE lower(label) = lower(NEW.reason)
      AND category = 'sale_return'
      AND deleted_at IS NULL
    LIMIT 1;
    -- Silent fallback if unmatched — reason text is snapshot, FK is best-effort.
  ELSIF NEW.reason_id IS NOT NULL AND NEW.reason IS NULL THEN
    SELECT label INTO NEW.reason FROM public.reason_lists WHERE id = NEW.reason_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_credit_note_reason_id ON public.credit_notes;
CREATE TRIGGER sync_credit_note_reason_id
  BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public._sync_credit_note_reason_id_fn();

-- 5b. refund_method_id ↔ refund_method (via payment_methods.slug)
CREATE OR REPLACE FUNCTION public._sync_credit_note_refund_method_id_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.refund_method_id IS NULL AND NEW.refund_method IS NOT NULL THEN
    SELECT id INTO NEW.refund_method_id
    FROM public.payment_methods
    WHERE slug = NEW.refund_method;
    IF NEW.refund_method_id IS NULL THEN
      RAISE EXCEPTION 'refund_method slug % has no matching payment_methods row', NEW.refund_method;
    END IF;
  ELSIF NEW.refund_method_id IS NOT NULL AND NEW.refund_method IS NULL THEN
    SELECT slug INTO NEW.refund_method FROM public.payment_methods WHERE id = NEW.refund_method_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_credit_note_refund_method_id ON public.credit_notes;
CREATE TRIGGER sync_credit_note_refund_method_id
  BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public._sync_credit_note_refund_method_id_fn();

-- customer_id has no companion text column — no sync trigger needed.
-- App writers will start filling customer_id directly.

NOTIFY pgrst, 'reload schema';

COMMIT;
