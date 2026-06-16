BEGIN;

-- Convert po_approvals.role from the legacy approval_role enum to TEXT,
-- casting existing enum values to their human-readable custom_roles.name.
-- This frees the enum type to be dropped.
ALTER TABLE po_approvals
  ALTER COLUMN role TYPE TEXT
  USING (
    CASE role::text
      WHEN 'purchase_manager'  THEN 'Purchase Manager'
      WHEN 'accountant'        THEN 'Accountant'
      WHEN 'owner'             THEN 'Owner'
      WHEN 'employee'          THEN 'Employee'
      WHEN 'warehouse_manager' THEN 'Warehouse Manager'
      WHEN 'brand_manager'     THEN 'Brand Manager'
      ELSE role::text
    END
  );

-- Now safe to drop the legacy approval_role_assignments table.
DROP TABLE IF EXISTS approval_role_assignments;

-- Drop the now-unused enum type.
DROP TYPE  IF EXISTS approval_role;

COMMIT;
