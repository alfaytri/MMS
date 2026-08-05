-- The RFQ PDF template changed (proper RFQ layout — blank price/supplier cells,
-- new "Please Quote By" field, instructions block). Every existing pdf_rfq_url
-- points at a stale render, so clear it — the next request regenerates.
--
-- Only pdf_rfq_url is cleared. Draft / PO / Confirmed variants are unchanged.

BEGIN;

UPDATE public.purchase_orders
SET    pdf_rfq_url = NULL
WHERE  pdf_rfq_url IS NOT NULL;

COMMIT;
