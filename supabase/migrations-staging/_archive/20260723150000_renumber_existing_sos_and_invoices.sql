-- Task 6 (SO/Invoice Parity) — renumber historical SOs to SO-YYYY-MM-NNN
-- and invoices to <SO>-I. Uses ROW_NUMBER() partitioned by year+month of
-- created_at, ordered by created_at + id for stable results.
--
-- Same rules as the PO renumber (20260722200000):
--   • Only touch rows in the old format (SO-NNNNN / INV-NNNNN).
--   • Invoices follow their SO.
--   • Clear cached PDFs (so_invoices, sale_deliveries, returns,
--     credit_notes) so future views regenerate with the new numbers.

BEGIN;

-- ── 1. Renumber SOs ────────────────────────────────────────────────────────

WITH ranked AS (
  SELECT
    id,
    'SO-' || TO_CHAR(created_at, 'YYYY-MM') || '-' ||
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY DATE_TRUNC('month', created_at)
          ORDER BY created_at, id
        )::TEXT, 3, '0'
      ) AS new_so_number
  FROM public.sale_orders
  WHERE so_number ~ '^SO-[0-9]+$'  -- only old-format numbers
)
UPDATE public.sale_orders s
SET    so_number = r.new_so_number
FROM   ranked r
WHERE  s.id = r.id;

-- ── 2. Rewrite invoice numbers to <new SO number>-I ────────────────────────

UPDATE public.so_invoices i
SET    invoice_id = s.so_number || '-I'
FROM   public.sale_orders s
WHERE  i.sale_order_id = s.id
  AND  i.invoice_id ~ '^INV-[0-9]+$';  -- only touch old-format invoice numbers

-- ── 3. Clear cached PDFs so they regenerate with the new numbers ──────────

UPDATE public.so_invoices     SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.sale_deliveries SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.returns         SET pdf_url = NULL WHERE pdf_url IS NOT NULL;
UPDATE public.credit_notes    SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

COMMIT;
