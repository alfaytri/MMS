-- supabase/migrations/20260502000001_service_inventory_supply_consumable.sql

BEGIN;

-- Drop the auto-named inline check constraint added by the previous migration
ALTER TABLE service_inventory
  DROP CONSTRAINT IF EXISTS service_inventory_link_type_check;

-- Migrate any rows that used the old types
UPDATE service_inventory
  SET link_type = 'consumable'
  WHERE link_type IN ('select_one', 'install_all');

-- Add clean named constraint with the two new types
ALTER TABLE service_inventory
  ADD CONSTRAINT service_inventory_link_type_check
  CHECK (link_type IN ('supply', 'consumable'));

COMMIT;
