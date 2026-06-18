-- Sync the system Admin role to include ALL current permission keys.
-- This fixes the Admin role falling behind as new permissions are added.

UPDATE public.custom_roles
SET permissions = ARRAY[
  -- Master Data (17)
  'master_data.companies.view', 'master_data.companies.manage',
  'master_data.divisions.view', 'master_data.divisions.manage',
  'master_data.warehouses.view', 'master_data.warehouses.manage',
  'master_data.inventory.view', 'master_data.inventory.manage',
  'master_data.suppliers.view', 'master_data.suppliers.manage',
  'master_data.users.view', 'master_data.users.manage',
  'master_data.roles.view', 'master_data.roles.manage',
  'master_data.audit.view',
  'master_data.admin.view', 'master_data.admin.manage',
  -- Purchase (16)
  'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
  'purchase.approvals.view', 'purchase.approvals.manage',
  'purchase.approvals.chain.manage', 'purchase.approvals.bypass',
  'purchase.shipments.view', 'purchase.shipments.manage',
  'purchase.landed_costs.view', 'purchase.landed_costs.manage',
  'purchase.warehouses.view', 'purchase.warehouses.manage',
  'purchase.returns.view', 'purchase.returns.manage',
  'purchase.dead_stock.view',
  -- Sales (5)
  'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
  'sales.returns.view', 'sales.returns.manage',
  -- Orders (4)
  'orders.view', 'orders.create', 'orders.edit', 'orders.assign',
  -- Contracts (3)
  'contracts.view', 'contracts.create', 'contracts.edit',
  -- Invoices & Payments (5)
  'invoices.view', 'invoices.create', 'invoices.edit',
  'payments.view', 'payments.manage',
  -- Teams (5)
  'teams.view', 'teams.manage',
  'employees.view', 'employees.manage',
  'teams.team_leader.view',
  -- System (3)
  'system.admin', 'system.import', 'system.export',
  -- Calendar (3)
  'calendar.view', 'calendar.edit-order', 'calendar.swap-teams',
  -- Contact Centre (1)
  'contact_centre.view'
]
WHERE is_system = true AND name = 'Admin';
