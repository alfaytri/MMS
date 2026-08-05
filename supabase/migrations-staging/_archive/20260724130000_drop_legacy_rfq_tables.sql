-- Drop the legacy "standalone RFQ" tables — introduced in the baseline schema
-- but never wired to any hook or component. The active RFQ workflow lives
-- inside the PO module (po_rfq_quotes, po_rfq_quote_items, purchase_orders.
-- rfq_supplier_ids) and doesn't reference these tables.
--
-- Removed:
--   * rfq_line_items         (FK to rfqs, CASCADE)
--   * rfq_quotes             (FK to rfqs, CASCADE)
--   * rfqs
--   * purchase_orders.rfq_id (FK column pointing at the dropped table)
--   * rfq_status enum        (only used by rfqs.status)

BEGIN;

ALTER TABLE public.purchase_orders
  DROP COLUMN IF EXISTS rfq_id;

DROP TABLE IF EXISTS public.rfq_line_items CASCADE;
DROP TABLE IF EXISTS public.rfq_quotes     CASCADE;
DROP TABLE IF EXISTS public.rfqs           CASCADE;

DROP TYPE IF EXISTS public.rfq_status;

COMMIT;
