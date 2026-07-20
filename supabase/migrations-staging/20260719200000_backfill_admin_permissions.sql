-- Backfill Admin role with complete permission set.
-- The original seed (20260706130000) was missing *.access nav-gate keys
-- and many *.view keys added in later migrations. Without the access keys,
-- the nav dropdowns are invisible even for Admin users.

UPDATE public.custom_roles
SET permissions = ARRAY[
  -- Nav access gates
  'master_data.access',
  'purchase_sales.access',
  'warehouse.access',
  'orders.access',
  'contracts.access',
  'invoices.access',
  'teams.access',
  'reports.access',

  -- Master Data
  'master_data.companies.view',       'master_data.companies.manage',
  'master_data.divisions.view',       'master_data.divisions.manage',
  'master_data.warehouses.view',      'master_data.warehouses.manage',
  'master_data.inventory.view',       'master_data.inventory.manage',
  'master_data.suppliers.view',       'master_data.suppliers.manage',
  'master_data.customers.view',       'master_data.customers.manage',
  'master_data.customers.change_credit_group', 'master_data.customers.change_type',
  'master_data.service_customers.view', 'master_data.service_customers.manage',
  'master_data.services.view',        'master_data.services.manage',
  'master_data.services.approve',
  'master_data.subscriptions.view',   'master_data.subscriptions.manage',
  'master_data.users.view',           'master_data.users.manage',
  'master_data.roles.view',           'master_data.roles.manage',
  'master_data.audit.view',
  'master_data.admin.view',           'master_data.admin.manage',

  -- Purchase
  'purchase.orders.view',             'purchase.orders.manage',
  'purchase.orders.create',           'purchase.orders.edit',
  'purchase.approvals.view',          'purchase.approvals.manage',
  'purchase.approvals.chain.manage',  'purchase.approvals.bypass',
  'purchase.shipments.view',          'purchase.shipments.manage',
  'purchase.receivals.view',          'purchase.receivals.manage',
  'purchase.landed_costs.view',       'purchase.landed_costs.manage',
  'purchase.bills.view',              'purchase.bills.manage',
  'purchase.dead_stock.view',
  'purchase.returns.view',            'purchase.returns.manage',
  'purchase.debit_notes.view',
  'purchase.warehouses.view',         'purchase.warehouses.manage',

  -- Sales
  'sales.orders.view',                'sales.orders.manage',
  'sales.orders.create',              'sales.orders.edit',
  'sales.approvals.view',             'sales.approvals.manage',
  'sales.invoices.view',              'sales.invoices.manage',
  'sales.returns.view',               'sales.returns.manage',
  'sales.deliveries.view',            'sales.deliveries.manage',
  'sales.credit_notes.view',          'sales.credit_notes.manage',

  -- Warehouse
  'warehouse.warehouses.view',        'warehouse.settings.manage',
  'warehouse.stock.view',
  'warehouse.transfers.view',         'warehouse.transfer.create',
  'warehouse.transfer.dispatch',      'warehouse.transfer.receive',
  'warehouse.transfer.approve',
  'warehouse.adjustments.view',       'warehouse.adjustment.request',
  'warehouse.checks.view',            'warehouse.check.count',
  'warehouse.check.create',
  'warehouse.stock_value.view',
  'warehouse.movements.view',
  'warehouse.receivals.view',

  -- Orders
  'orders.view',                      'orders.manage',
  'orders.create',                    'orders.edit',
  'orders.assign',
  'follow_ups.request',               'follow_ups.confirm',
  'quotations.view',                  'quotations.manage',

  -- Contracts
  'contracts.quotations.view',        'contracts.quotations.manage',
  'contracts.live.view',              'contracts.live.manage',
  'contracts.activate',
  'contracts.view',                   'contracts.create',
  'contracts.edit',

  -- Invoices & Payments
  'invoices.view',                    'invoices.manage',
  'invoices.create',                  'invoices.edit',
  'payments.view',                    'payments.manage',

  -- Teams & Employees
  'teams.view',                       'teams.manage',
  'employees.view',                   'employees.manage',
  'teams.team_leader.view',           'teams.team_leader.manage',
  'teams.map.view',                   'teams.map.manage',
  'calendar.view',                    'calendar.manage',

  -- Reports
  'reports.view',                     'reports.manage',

  -- Contact Centre
  'contact_centre.view',

  -- System
  'system.admin',                     'system.import',
  'system.export'
]
WHERE name = 'Admin' AND deleted_at IS NULL;
