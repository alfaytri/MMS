-- Fix: payments with direction='incoming' but no invoice_id, no payment_id, and no source_id
-- are PO-linked payments that were recorded with the wrong direction.
-- Move them to 'outgoing' so they appear in Purchase Payments, not Invoice Payments.

UPDATE payments
SET direction = 'outgoing'
WHERE direction = 'incoming'
  AND payment_id IS NULL
  AND invoice_id IS NULL
  AND source_id   IS NULL;
