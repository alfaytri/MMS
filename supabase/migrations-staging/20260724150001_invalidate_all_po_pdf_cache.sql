-- The PO PDF template now renders vendor_notes on every variant, and the
-- RFQ variant reads quote_deadline (new column). Cached PDFs in Storage
-- predate both features, so clear every variant URL so the next request
-- regenerates.

BEGIN;

UPDATE public.purchase_orders
SET    pdf_rfq_url       = NULL,
       pdf_draft_url     = NULL,
       pdf_po_url        = NULL,
       pdf_confirmed_url = NULL
WHERE  pdf_rfq_url       IS NOT NULL
   OR  pdf_draft_url     IS NOT NULL
   OR  pdf_po_url        IS NOT NULL
   OR  pdf_confirmed_url IS NOT NULL;

COMMIT;
