-- Backfill direction='outgoing' for supplier/AP payments that still have the
-- default direction='incoming' from when the column was first added.
--
-- Two cases:
--   1. Payments linked to an AP bill (invoices.direction = 'ap')
--   2. PO-direct payments (source_type = 'purchase_order')
--
-- Migration 200005 only covered payments with invoice_id IS NULL AND source_id IS NULL,
-- missing bill-linked payments entirely.

UPDATE payments p
SET direction = 'outgoing'
WHERE p.direction = 'incoming'
  AND (
    p.invoice_id IN (SELECT id FROM invoices WHERE direction = 'ap')
    OR p.source_type = 'purchase_order'
  );
