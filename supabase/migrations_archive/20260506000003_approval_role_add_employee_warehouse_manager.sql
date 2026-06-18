-- supabase/migrations/20260506000003_approval_role_add_employee_warehouse_manager.sql
--
-- Adds 'employee' and 'warehouse_manager' to the approval_role enum.
-- 'employee' was already in the TypeScript type but missing from the DB enum.
-- 'warehouse_manager' is a new role for users who approve warehouse transfers
-- and stock adjustments.

BEGIN;

ALTER TYPE approval_role ADD VALUE IF NOT EXISTS 'employee';
ALTER TYPE approval_role ADD VALUE IF NOT EXISTS 'warehouse_manager';

COMMIT;
