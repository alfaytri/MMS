-- PO PDF cache — 4 variants (RFQ, Draft, PO, Confirmed PO) + payment hash.
-- Replaces the single pdf_url column and single-arg RPC from 20260701120000/20260701120100.

-- ── 1. Add per-variant URL columns + payment hash ───────────────────────────
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pdf_rfq_url       TEXT,
  ADD COLUMN IF NOT EXISTS pdf_draft_url     TEXT,
  ADD COLUMN IF NOT EXISTS pdf_po_url        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_confirmed_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_payment_hash  TEXT;

COMMENT ON COLUMN public.purchase_orders.pdf_rfq_url       IS 'Public URL of the RFQ variant PDF. NULL = needs (re)generating.';
COMMENT ON COLUMN public.purchase_orders.pdf_draft_url     IS 'Public URL of the Draft PO variant PDF. NULL = needs (re)generating.';
COMMENT ON COLUMN public.purchase_orders.pdf_po_url        IS 'Public URL of the PO variant PDF. NULL = needs (re)generating.';
COMMENT ON COLUMN public.purchase_orders.pdf_confirmed_url IS 'Public URL of the Confirmed PO variant PDF. NULL = needs (re)generating.';
COMMENT ON COLUMN public.purchase_orders.pdf_payment_hash  IS 'Format "count:totalPaid" — hash of the payments used when the po/confirmed PDF was last generated. Mismatch triggers regen.';

-- ── 2. Migrate existing pdf_url → pdf_po_url, then drop the old column ─────
UPDATE public.purchase_orders SET pdf_po_url = pdf_url WHERE pdf_url IS NOT NULL;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS pdf_url;

-- ── 3. Update invalidation trigger — null all 4 URLs + hash ─────────────────
CREATE OR REPLACE FUNCTION public.purchase_orders_invalidate_pdf_cache_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.skip_pdf_invalidation', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.pdf_rfq_url       := NULL;
  NEW.pdf_draft_url     := NULL;
  NEW.pdf_po_url        := NULL;
  NEW.pdf_confirmed_url := NULL;
  NEW.pdf_payment_hash  := NULL;
  RETURN NEW;
END;
$$;

-- ── 4. Update line-item cascade trigger — null all 4 URLs + hash on parent ──
CREATE OR REPLACE FUNCTION public.po_line_items_invalidate_parent_pdf_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_po_id UUID;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF v_po_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.purchase_orders
     SET pdf_rfq_url       = NULL,
         pdf_draft_url     = NULL,
         pdf_po_url        = NULL,
         pdf_confirmed_url = NULL,
         pdf_payment_hash  = NULL
   WHERE id = v_po_id
     AND (pdf_rfq_url IS NOT NULL
       OR pdf_draft_url IS NOT NULL
       OR pdf_po_url IS NOT NULL
       OR pdf_confirmed_url IS NOT NULL
       OR pdf_payment_hash IS NOT NULL);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 5. Replace RPC with variant-aware version ───────────────────────────────
DROP FUNCTION IF EXISTS public.set_po_pdf_url(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.set_po_pdf_url(
  p_id           UUID,
  p_variant      TEXT,
  p_url          TEXT,
  p_payment_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.skip_pdf_invalidation', 'true', true);

  IF p_variant = 'rfq' THEN
    UPDATE public.purchase_orders SET pdf_rfq_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'draft' THEN
    UPDATE public.purchase_orders SET pdf_draft_url = p_url WHERE id = p_id;
  ELSIF p_variant = 'po' THEN
    UPDATE public.purchase_orders
       SET pdf_po_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSIF p_variant = 'confirmed' THEN
    UPDATE public.purchase_orders
       SET pdf_confirmed_url = p_url, pdf_payment_hash = p_payment_hash
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Invalid PDF variant: %', p_variant;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_po_pdf_url(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_po_pdf_url(UUID, TEXT, TEXT, TEXT) TO service_role;
