-- Add the 'planned' shipment status (plan-ahead shipments, #3 phase 3b).
-- Standalone migration: an ALTER TYPE ADD VALUE must commit before the value is used.
alter type public.shipment_status add value if not exists 'planned';
