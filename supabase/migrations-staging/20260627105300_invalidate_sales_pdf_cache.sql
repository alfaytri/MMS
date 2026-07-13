-- ─────────────────────────────────────────────────────────────────────────────
-- One-off cache invalidation after the SO Quotation / AR Invoice PDF redesign
-- (bilingual layout matching the order-confirmation). Existing cached URLs
-- still point at the old visual, so we null them — next "View PDF" / "Download"
-- click regenerates with the new design.
--
-- The cache-invalidation trigger fires on the UPDATE but only zeros the URL,
-- which is exactly what we want. The skip-flag isn't needed here.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.sale_orders
   SET quotation_pdf_url = NULL
 WHERE quotation_pdf_url IS NOT NULL;

UPDATE public.invoices
   SET pdf_url = NULL
 WHERE pdf_url IS NOT NULL
   AND direction = 'ar';
