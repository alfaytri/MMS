export const PERMISSION_TO_MODULES: Record<string, string[]> = {
  'inventory.catalog.view':  ['inventory'],
  'warehouse.access':            ['warehouses'],
  'master_data.users.view':      ['profiles', 'custom_roles'],
  'master_data.admin.view':      [
    'companies', 'currencies', 'payment_methods', 'country_codes',
    'brand_groups', 'reason_lists', 'approval_settings', 'work_schedules',
  ],
  'master_data.suppliers.view':  ['suppliers'],
  'master_data.customers.view':  ['customers'],
  'purchase.orders.view':        ['purchase_orders'],
  'purchase.approvals.view':     ['po_approvals'],
  'purchase.receivals.view':     ['receivals'],
  'purchase.bills.view':         ['bills'],
  'purchase.returns.view':       ['purchase_returns'],
  'purchase.debit_notes.view':   ['debit_notes'],
  'sales.orders.view':           ['sale_orders'],
  'sales.approvals.view':        ['sale_approvals'],
  'sales.invoices.view':         ['invoices'],
  'sales.returns.view':          ['sale_returns'],
  'sales.deliveries.view':       ['deliveries'],
  'sales.credit_notes.view':     ['credit_notes'],
}

export const MODULE_GROUPS = {
  'Master Data': ['inventory', 'warehouses', 'profiles', 'custom_roles', 'companies',
    'currencies', 'payment_methods', 'country_codes', 'brand_groups',
    'reason_lists', 'approval_settings', 'work_schedules'],
  'Purchase & Sales': ['suppliers', 'customers', 'purchase_orders', 'po_approvals',
    'receivals', 'bills', 'purchase_returns', 'debit_notes', 'sale_orders',
    'sale_approvals', 'invoices', 'sale_returns', 'deliveries', 'credit_notes'],
} as const

export function getAllowedModules(permissions: string[], isSystemAdmin: boolean): string[] {
  if (isSystemAdmin) {
    return Object.values(PERMISSION_TO_MODULES).flat()
  }
  const modules = new Set<string>()
  for (const perm of permissions) {
    const mapped = PERMISSION_TO_MODULES[perm]
    if (mapped) mapped.forEach((m) => modules.add(m))
  }
  return Array.from(modules)
}

export function humanizeModule(module: string): string {
  const map: Record<string, string> = {
    inventory: 'Inventory',
    warehouses: 'Warehouses',
    profiles: 'Users',
    custom_roles: 'Roles',
    companies: 'Companies',
    currencies: 'Currencies',
    payment_methods: 'Payment Methods',
    country_codes: 'Country Codes',
    brand_groups: 'Brand Groups',
    reason_lists: 'Reason Lists',
    approval_settings: 'Approval Settings',
    work_schedules: 'Work Schedules',
    suppliers: 'Suppliers',
    customers: 'Customers',
    purchase_orders: 'Purchase Orders',
    po_approvals: 'PO Approvals',
    receivals: 'Receivals',
    bills: 'Bills',
    purchase_returns: 'Purchase Returns',
    debit_notes: 'Debit Notes',
    sale_orders: 'Sale Orders',
    sale_approvals: 'Sale Approvals',
    invoices: 'Invoices',
    sale_returns: 'Sale Returns',
    deliveries: 'Deliveries',
    credit_notes: 'Credit Notes',
    sales: 'Sales',
    services: 'Services',
    contracts: 'Contracts',
    payments: 'Payments',
    settings: 'Settings',
    unknown: 'General',
  }
  return map[module] ?? module.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
