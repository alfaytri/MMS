-- supabase/migrations/20260505000013_warehouse_manager_profile.sql
--
-- Adds manager_profile_id to warehouses so that a system user (profile) can be
-- designated as the warehouse approver.  Distinct from manager_id which points
-- to the employees (field technician) table.
--
-- Also adds created_by_profile_id to warehouse_transfers so that the approval
-- workflow can notify the original requester on approve / reject.

BEGIN;

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS manager_profile_id UUID REFERENCES profiles(id);

ALTER TABLE warehouse_transfers
  ADD COLUMN IF NOT EXISTS created_by_profile_id UUID REFERENCES profiles(id);

COMMIT;
