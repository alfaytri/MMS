-- Add po_type enum to distinguish RFQ, Draft, and Confirmed purchase orders
CREATE TYPE po_type AS ENUM ('rfq', 'draft', 'confirmed');

-- Add po_type column with default 'draft' (existing POs become draft)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_type po_type NOT NULL DEFAULT 'draft';

-- Back-fill: any PO that was approved/received/completed → confirmed
UPDATE purchase_orders
SET po_type = 'confirmed'
WHERE status IN ('approved', 'partially_received', 'received', 'completed');

-- Back-fill: any PO linked to an RFQ that is still draft → rfq
UPDATE purchase_orders
SET po_type = 'rfq'
WHERE rfq_id IS NOT NULL AND status = 'draft';

-- Index for fast filtering by po_type
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_type ON purchase_orders (po_type);
