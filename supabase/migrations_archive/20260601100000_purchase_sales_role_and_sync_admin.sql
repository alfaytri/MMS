-- 1. Create "Purchase & Sales Staff" role
--    Access: Purchase & Sales (full), Master Data > Warehouses, Master Data > Services
INSERT INTO custom_roles (name, description, color, permissions, is_system)
VALUES (
  'Purchase & Sales Staff',
  'Access to Purchase & Sales module, Warehouses, and Services catalog.',
  'bg-blue-500/15 text-blue-600 border-blue-500/30',
  ARRAY[
    -- Master Data (limited)
    'master_data.warehouses.view',
    'master_data.services.view',
    'master_data.suppliers.view',
    'master_data.suppliers.manage',
    'master_data.customers.view',
    'master_data.customers.manage',
    'master_data.inventory.view',
    -- Purchase (full)
    'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
    'purchase.approvals.view',
    'purchase.shipments.view', 'purchase.shipments.manage',
    'purchase.landed_costs.view', 'purchase.landed_costs.manage',
    'purchase.warehouses.view', 'purchase.warehouses.manage',
    'purchase.returns.view', 'purchase.returns.manage',
    'purchase.dead_stock.view',
    'purchase.bills.view', 'purchase.bills.manage',
    'purchase.rfq.view', 'purchase.rfq.manage',
    -- Sales (full)
    'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
    'sales.returns.view', 'sales.returns.manage',
    'sales.deliveries.view', 'sales.deliveries.manage',
    'sales.credit_notes.view', 'sales.credit_notes.manage'
  ],
  false
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      permissions = EXCLUDED.permissions;

-- 2. Sync Admin role with ALL new permissions added in this release
UPDATE custom_roles
SET permissions = ARRAY[
  -- Master Data
  'master_data.companies.view', 'master_data.companies.manage',
  'master_data.divisions.view', 'master_data.divisions.manage',
  'master_data.warehouses.view', 'master_data.warehouses.manage',
  'master_data.inventory.view', 'master_data.inventory.manage',
  'master_data.suppliers.view', 'master_data.suppliers.manage',
  'master_data.customers.view', 'master_data.customers.manage',
  'master_data.service_customers.view', 'master_data.service_customers.manage',
  'master_data.services.view', 'master_data.services.manage',
  'master_data.subscriptions.view', 'master_data.subscriptions.manage',
  'master_data.users.view', 'master_data.users.manage',
  'master_data.roles.view', 'master_data.roles.manage',
  'master_data.audit.view',
  'master_data.admin.view', 'master_data.admin.manage',
  -- Purchase
  'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
  'purchase.approvals.view', 'purchase.approvals.manage',
  'purchase.approvals.chain.manage', 'purchase.approvals.bypass',
  'purchase.shipments.view', 'purchase.shipments.manage',
  'purchase.landed_costs.view', 'purchase.landed_costs.manage',
  'purchase.warehouses.view', 'purchase.warehouses.manage',
  'purchase.returns.view', 'purchase.returns.manage',
  'purchase.dead_stock.view',
  'purchase.bills.view', 'purchase.bills.manage',
  'purchase.rfq.view', 'purchase.rfq.manage',
  -- Sales
  'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
  'sales.returns.view', 'sales.returns.manage',
  'sales.deliveries.view', 'sales.deliveries.manage',
  'sales.credit_notes.view', 'sales.credit_notes.manage',
  -- Orders
  'orders.view', 'orders.create', 'orders.edit', 'orders.assign',
  -- Quotations
  'quotations.view', 'quotations.create', 'quotations.edit',
  -- Contracts
  'contracts.view', 'contracts.create', 'contracts.edit',
  -- Invoices & Payments
  'invoices.view', 'invoices.create', 'invoices.edit',
  'payments.view', 'payments.manage',
  -- Teams
  'teams.view', 'teams.manage',
  'employees.view', 'employees.manage',
  'teams.team_leader.view',
  'teams.map.view',
  -- Calendar
  'calendar.view', 'calendar.edit-order', 'calendar.swap-teams',
  -- Reports
  'reports.view', 'reports.export',
  -- Contact Centre
  'contact_centre.view',
  -- System
  'system.admin', 'system.import', 'system.export'
]
WHERE name = 'Admin' AND is_system = true;
