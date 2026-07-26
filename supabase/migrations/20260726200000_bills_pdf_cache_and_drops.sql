-- ============================================================
-- Bills PDF cache wiring + drop 2 more dead columns
--
-- Section 1.4 follow-up from docs/next-work-plan.md. The audit
-- surfaced 4 dead columns; the user decided to KEEP pdf_url and
-- needs_refresh and wire them up as a proper PDF cache (mirrors
-- the AR-side pattern from 20260627101900_sales_pdf_cache):
--   • pdf_url      — the cached PDF public URL
--   • needs_refresh = true while the cached PDF is stale
-- Any UPDATE on a bill (including payment-driven paid_amount
-- recompute) invalidates both. The generator writes the URL back
-- via a SECURITY DEFINER RPC that sets a transaction-local GUC to
-- suppress the invalidation trigger.
--
-- Also drops:
--   • bills.tax          — always written as 0, no reader
--   • bills.updated_at   — no trigger sets it, no reader
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the 2 dead columns
-- ------------------------------------------------------------
ALTER TABLE public.bills
  DROP COLUMN IF EXISTS tax,
  DROP COLUMN IF EXISTS updated_at;

-- ------------------------------------------------------------
-- 2. BEFORE UPDATE trigger on bills — invalidates pdf cache
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bills_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- The set_bill_pdf_url RPC sets this GUC before writing the URL
  -- back, so the trigger lets the write through without invalidating.
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_url       := NULL;
  NEW.needs_refresh := TRUE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bills_invalidate_pdf_cache ON public.bills;
CREATE TRIGGER bills_invalidate_pdf_cache
  BEFORE UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.bills_invalidate_pdf_cache_fn();

-- ------------------------------------------------------------
-- 3. Cascade from bill_line_items — any I/U/D nulls parent PDF
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_bill_id UUID;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  IF v_bill_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.bills
     SET pdf_url = NULL, needs_refresh = TRUE
   WHERE id = v_bill_id
     AND (pdf_url IS NOT NULL OR needs_refresh = FALSE);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bill_line_items_cascade_pdf_invalidation ON public.bill_line_items;
CREATE TRIGGER bill_line_items_cascade_pdf_invalidation
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_line_items_invalidate_parent_pdf_fn();

-- Payment invalidation is handled implicitly: every payments write
-- fires payments_trigger_bill_recompute_fn which UPDATEs bills.paid_amount,
-- and every UPDATE on bills passes through bills_invalidate_pdf_cache_fn
-- above. Same for payment_bill_allocations. So no separate cascade
-- from those tables is needed.

-- ------------------------------------------------------------
-- 4. set_bill_pdf_url — the write-back RPC used by the generator
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_bill_pdf_url(p_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- is_local = true → resets at COMMIT.
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);
  UPDATE public.bills
     SET pdf_url = p_url, needs_refresh = FALSE
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_bill_pdf_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_bill_pdf_url(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
