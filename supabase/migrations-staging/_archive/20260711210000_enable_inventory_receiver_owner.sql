-- Enable is_inventory_receiver on the Owner role (dev DB)
UPDATE public.custom_roles
SET is_inventory_receiver = true
WHERE name = 'Owner';
