-- ─────────────────────────────────────────────────────────────────────────────
-- Force a regeneration of every cached sales PDF.
--
-- The generators now upload with cacheControl=0 and append `?v=<timestamp>` to
-- the persisted public URL, so each regeneration bypasses CDN/browser cache.
-- Without this backfill the previously-stored URLs would keep getting served
-- from the CDN until they expired naturally.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.sale_orders
   SET quotation_pdf_url = NULL
 WHERE quotation_pdf_url IS NOT NULL;

UPDATE public.invoices
   SET pdf_url = NULL
 WHERE pdf_url IS NOT NULL
   AND direction = 'ar';

UPDATE public.credit_notes
   SET pdf_url = NULL
 WHERE pdf_url IS NOT NULL;
