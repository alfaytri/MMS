-- Seed the built-in Admin role with every permission key.
-- is_system = true → locked in UI (cannot be edited or deleted via RoleFormDialog).
-- ON CONFLICT DO NOTHING makes this idempotent — safe to run multiple times.

BEGIN;

INSERT INTO custom_roles (name, description, color, permissions, is_system)
VALUES (
  'Admin',
  'Full system access — all modules and all actions.',
  'bg-rose-500/15 text-rose-600 border-rose-500/30',
  ARRAY[
    -- Master Data
    'master_data.companies.view', 'master_data.companies.manage',
    'master_data.divisions.view', 'master_data.divisions.manage',
    'master_data.warehouses.view', 'master_data.warehouses.manage',
    'master_data.inventory.view', 'master_data.inventory.manage',
    'master_data.suppliers.view', 'master_data.suppliers.manage',
    'master_data.users.view', 'master_data.users.manage',
    'master_data.roles.view', 'master_data.roles.manage',
    'master_data.audit.view',
    'master_data.admin.view', 'master_data.admin.manage',
    -- Purchase
    'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
    'purchase.approvals.view', 'purchase.approvals.manage',
    'purchase.shipments.view', 'purchase.shipments.manage',
    'purchase.landed_costs.view', 'purchase.landed_costs.manage',
    'purchase.warehouses.view', 'purchase.warehouses.manage',
    'purchase.returns.view', 'purchase.returns.manage',
    'purchase.dead_stock.view',
    -- Sales
    'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
    'sales.returns.view', 'sales.returns.manage',
    -- Orders
    'orders.view', 'orders.create', 'orders.edit', 'orders.assign',
    -- Contracts
    'contracts.view', 'contracts.create', 'contracts.edit',
    -- Invoices
    'invoices.view', 'invoices.create', 'invoices.edit',
    'payments.view', 'payments.manage',
    -- Teams
    'teams.view', 'teams.manage',
    'employees.view', 'employees.manage',
    -- System
    'system.admin', 'system.import', 'system.export'
  ],
  true  -- is_system: locked in UI
)
ON CONFLICT (name) DO UPDATE
  SET
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    is_system   = true;

-- Assign the Admin role to m.ismail@alfaytri.com automatically.
-- Wrapped in a DO block so it silently skips if the profile doesn't exist yet
-- (e.g. first migration run before profile is created).
DO $$
DECLARE
  v_profile_id  uuid;
  v_role_id     uuid;
BEGIN
  SELECT id INTO v_profile_id FROM profiles
  WHERE auth_user_id = '6c2bca5d-247b-4350-87a0-c96458883cfd';

  SELECT id INTO v_role_id FROM custom_roles WHERE name = 'Admin';

  IF v_profile_id IS NOT NULL AND v_role_id IS NOT NULL THEN
    INSERT INTO user_custom_roles (profile_id, role_id)
    VALUES (v_profile_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
