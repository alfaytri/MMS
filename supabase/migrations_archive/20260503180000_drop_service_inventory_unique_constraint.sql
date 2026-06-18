-- Drop the (service_id, brand_variant_id) unique constraint so the same
-- inventory variant can be linked to the same service more than once
-- (e.g. as both supply and consumable, or multiple supply items).
-- Application logic already prevents meaningless duplicates via link_type.

BEGIN;

ALTER TABLE service_inventory
  DROP CONSTRAINT IF EXISTS service_inventory_service_id_brand_variant_id_key;

COMMIT;
