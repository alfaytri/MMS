-- Bulk-assign Alfaytri-Maintenance division to all services that have no division set.
-- Services that already carry a division value are left untouched.
UPDATE services
SET division = ARRAY['Alfaytri-Maintenance']
WHERE division IS NULL OR division = '{}';
