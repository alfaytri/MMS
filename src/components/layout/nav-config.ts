// src/components/layout/nav-config.ts
export type NavItem = {
  label: string
  href: string
  icon?: string
  comingSoon?: boolean
  permission?: string | string[]
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export type NavEntry = {
  label: string
  icon: string
  comingSoon?: boolean
  permission?: string | string[]
  groups: NavGroup[]
}

export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: 'Database',
    permission: 'master_data.access',
    groups: [
      {
        items: [
          { label: 'Inventory',     href: '/master-data/inventory',  icon: 'Package',     permission: 'master_data.inventory.view' },
          { label: 'Warehouses',    href: '/master-data/warehouses', icon: 'Warehouse',   permission: 'warehouse.access' },
          { label: 'Users & Roles', href: '/master-data/users',     icon: 'UserCog',     permission: ['master_data.users.view', 'master_data.roles.view'] },
          { label: 'Audit Trail',  href: '/master-data/audit-trail', icon: 'ScrollText',  permission: 'master_data.audit.view' },
          { label: 'Admin',        href: '/master-data/admin',      icon: 'Settings',    permission: 'master_data.admin.view' },
        ],
      },
    ],
  },
  {
    label: 'Reports',
    icon: 'BarChart3',
    permission: 'reports.access',
    groups: [
      {
        items: [
          { label: 'Financial Dashboard',   href: '/reports/dashboard',              icon: 'LayoutDashboard', permission: 'reports.view' },
          { label: 'Product Profitability', href: '/reports/product-profitability',  icon: 'TrendingUp',      permission: 'reports.view' },
        ],
      },
    ],
  },
  {
    label: 'Purchase & Sales',
    icon: 'ShoppingBag',
    permission: 'purchase_sales.access',
    groups: [
      {
        label: 'Vendors & Clients',
        items: [
          { label: 'Suppliers', href: '/master-data/suppliers', icon: 'Truck',     permission: 'master_data.suppliers.view' },
          { label: 'Customers', href: '/master-data/customers', icon: 'UserCheck', permission: 'master_data.customers.view' },
        ],
      },
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders',       icon: 'ClipboardList', permission: 'purchase.orders.view' },
          { label: 'Approvals',       href: '/purchase/approvals',    icon: 'CheckCircle',   permission: 'purchase.approvals.view' },
          { label: 'Receivals',       href: '/purchase/receivals',    icon: 'PackageOpen',   permission: 'purchase.receivals.view' },
          { label: 'Bills',           href: '/purchase/bills',        icon: 'Receipt',       permission: 'purchase.bills.view' },
          { label: 'Returns',         href: '/purchase/returns',      icon: 'RotateCcw',     permission: 'purchase.returns.view' },
          { label: 'Debit Notes',     href: '/purchase/debit-notes',  icon: 'FileX2',        permission: 'purchase.debit_notes.view' },
          { label: 'Aging Report',    href: '/purchase/aging-report', icon: 'Clock',         permission: 'purchase.bills.view' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders',  href: '/sales/orders',        icon: 'ShoppingBag',  permission: 'sales.orders.view' },
          { label: 'Approvals',    href: '/sales/approvals',     icon: 'ShieldCheck',  permission: 'sales.approvals.view' },
          { label: 'SO Invoices',  href: '/sales/invoices',      icon: 'FileText',     permission: 'sales.invoices.view' },
          { label: 'Returns',      href: '/sales/returns',       icon: 'RotateCcw',    permission: 'sales.returns.view' },
          { label: 'Deliveries',   href: '/sales/deliveries',    icon: 'PackageCheck', permission: 'sales.deliveries.view' },
          { label: 'Credit Notes',        href: '/sales/credit-notes',        icon: 'FileX',       permission: 'sales.credit_notes.view' },
          { label: 'Customer Statement', href: '/sales/customer-statement', icon: 'ScrollText', permission: 'sales.invoices.view' },
          { label: 'Aging Report',       href: '/sales/aging-report',       icon: 'Clock',       permission: 'sales.invoices.view' },
        ],
      },
      {
        label: 'LOGISTICS & REPORTS',
        items: [
          { label: 'Shipments',         href: '/purchase/shipments',    icon: 'Ship',       permission: 'purchase.shipments.view' },
          { label: 'Landed Costs',      href: '/purchase/landed-costs', icon: 'Calculator', permission: 'purchase.landed_costs.view' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock',   icon: 'BarChart3',  permission: 'purchase.dead_stock.view' },
        ],
      },
      {
        label: 'WAREHOUSE OPS',
        items: [
          { label: 'Custody',        href: '/warehouse/custody',        icon: 'HandCoins',     permission: 'warehouse.access' },
          { label: 'Consumption',    href: '/consumption',              icon: 'Flame',         permission: 'warehouse.access' },
          { label: 'Damaged Stock',  href: '/warehouse/damaged-stock',  icon: 'AlertTriangle', permission: 'warehouse.access' },
        ],
      },
    ],
  },
]
