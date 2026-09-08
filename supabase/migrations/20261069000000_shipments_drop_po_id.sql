-- 20261069000000_shipments_drop_po_id.sql
-- Retire the single-PO column — superseded by shipment_line_items. Its RLS
-- policies were rewritten to is_shipment_visible in 20261068 and no code reads
-- it any more (POs are derived through the lines). Plan Task 14.
-- ROLLOUT NOTE: on new-prod, apply this only AFTER the new frontend is live —
-- the currently-deployed build still reads po_id.
BEGIN;
ALTER TABLE public.shipments DROP COLUMN po_id;
NOTIFY pgrst, 'reload schema';
COMMIT;
