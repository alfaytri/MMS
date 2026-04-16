export const PERMISSION_GROUPS = [
  {
    module: 'Master Data',
    keys: [
      'master_data.companies.view', 'master_data.companies.manage',
      'master_data.divisions.view', 'master_data.divisions.manage',
      'master_data.warehouses.view', 'master_data.warehouses.manage',
      'master_data.inventory.view', 'master_data.inventory.manage',
      'master_data.suppliers.view', 'master_data.suppliers.manage',
      'master_data.users.view', 'master_data.users.manage',
      'master_data.roles.view', 'master_data.roles.manage',
      'master_data.audit.view',
      'master_data.admin.view', 'master_data.admin.manage',
    ],
  },
  {
    module: 'Purchase',
    keys: [
      'purchase.orders.view', 'purchase.orders.create', 'purchase.orders.edit',
      'purchase.approvals.view', 'purchase.approvals.manage',
      'purchase.shipments.view', 'purchase.shipments.manage',
      'purchase.landed_costs.view', 'purchase.landed_costs.manage',
      'purchase.warehouses.view', 'purchase.warehouses.manage',
      'purchase.returns.view', 'purchase.returns.manage',
      'purchase.dead_stock.view',
    ],
  },
  {
    module: 'Sales',
    keys: [
      'sales.orders.view', 'sales.orders.create', 'sales.orders.edit',
      'sales.returns.view', 'sales.returns.manage',
    ],
  },
  {
    module: 'Orders',
    keys: ['orders.view', 'orders.create', 'orders.edit', 'orders.assign'],
  },
  {
    module: 'Contracts',
    keys: ['contracts.view', 'contracts.create', 'contracts.edit'],
  },
  {
    module: 'Invoices',
    keys: ['invoices.view', 'invoices.create', 'invoices.edit', 'payments.view', 'payments.manage'],
  },
  {
    module: 'Teams',
    keys: ['teams.view', 'teams.manage', 'employees.view', 'employees.manage'],
  },
  {
    module: 'System',
    keys: ['system.admin', 'system.import', 'system.export'],
  },
] as const

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.keys)
