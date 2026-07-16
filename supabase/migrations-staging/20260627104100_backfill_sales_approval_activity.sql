-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: sales approval activity entries were written with module='sales',
-- but the SO detail dialog filters by module='sale_orders'. Renaming the
-- existing rows so they show up in the Activity tab now that the hooks write
-- the correct module name going forward.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.activity_log
SET    module = 'sale_orders'
WHERE  module = 'sales'
  AND  entity_type = 'sale_order'
  AND  action IN (
         'Sales Approval Approved',
         'Sales Approval Rejected',
         'Sales Approval Force-Approved (margin)',
         'Sales Approval Force-Approved (credit)'
       );
