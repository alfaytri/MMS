-- supabase/migrations/20260428000004_extend_sale_order_status_enum.sql
-- The original enum only had: quotation, confirmed, in_progress, delivered, cancelled
-- + pending_approval was added in 20260427000002.
-- The RPC and app code also use partial_delivery, invoiced, closed — add them now.

BEGIN;

ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'partial_delivery';
ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'invoiced';
ALTER TYPE sale_order_status ADD VALUE IF NOT EXISTS 'closed';

COMMIT;
