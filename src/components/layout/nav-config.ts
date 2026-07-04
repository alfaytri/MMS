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
          { label: 'Warehouses',    href: '/purchase/warehouses',    icon: 'Warehouse',   permission: 'warehouse.access' },
          { label: 'Users & Roles', href: '/master-data/users',     icon: 'UserCog',     permission: ['master_data.users.view', 'master_data.roles.view'] },
          { label: 'Audit Trail',  href: '/master-data/audit-trail', icon: 'ScrollText',  permission: 'master_data.audit.view' },
          { label: 'Admin',        href: '/master-data/admin',      icon: 'Settings',    permission: 'master_data.admin.view' },
        ],
      },
    ],
  },
  {
    label: 'Invoices',
    icon: 'Receipt',
    permission: 'invoices.access',
    groups: [
      {
        label: 'PURCHASE & SALES',
        items: [
          { label: 'Customer Payments', href: '/invoices/payments',         icon: 'CreditCard',  permission: 'payments.view' },
          { label: 'Supplier Payments', href: '/purchase/payments',         icon: 'Wallet',      permission: 'purchase.payments.view' },
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
          { label: 'Suppliers', href: '/master-data/suppliers',  icon: 'Truck',   permission: 'master_data.suppliers.view' },
          { label: 'Customers', href: '/master-data/customers',  icon: 'UserCheck', permission: 'master_data.customers.view' },
        ],
      },
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders',   href: '/purchase/orders',       icon: 'ClipboardList', permission: 'purchase.orders.view' },
          { label: 'Approvals',         href: '/purchase/approvals',    icon: 'CheckCircle',   permission: 'purchase.approvals.view' },
          { label: 'Shipments',         href: '/purchase/shipments',    icon: 'Ship',          permission: 'purchase.shipments.view' },
          { label: 'Receivals',         href: '/purchase/receivals',    icon: 'PackageOpen',   permission: 'purchase.receivals.view' },
          { label: 'Landed Costs',      href: '/purchase/landed-costs', icon: 'Calculator',    permission: 'purchase.landed_costs.view' },
          { label: 'Bills',             href: '/purchase/bills',        icon: 'Receipt',       permission: 'purchase.bills.view' },
          { label: 'Returns',           href: '/purchase/returns',      icon: 'RotateCcw',     permission: 'purchase.returns.view' },
          { label: 'Debit Notes',       href: '/purchase/debit-notes',  icon: 'FileX2',        permission: 'purchase.debit_notes.view' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock',   icon: 'BarChart3',     permission: 'purchase.dead_stock.view' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders',  href: '/sales/orders',        icon: 'ShoppingBag',  permission: 'sales.orders.view' },
          { label: 'Approvals',    href: '/sales/approvals',     icon: 'ShieldCheck',  permission: 'sales.approvals.view' },
          { label: 'Invoices',     href: '/sales/invoices',      icon: 'FileText',     permission: 'sales.invoices.view' },
          { label: 'Returns',      href: '/sales/returns',       icon: 'RotateCcw',    permission: 'sales.returns.view' },
          { label: 'Deliveries',   href: '/sales/deliveries',    icon: 'PackageCheck', permission: 'sales.deliveries.view' },
          { label: 'Credit Notes', href: '/sales/credit-notes',  icon: 'FileX',        permission: 'sales.credit_notes.view' },
        ],
      },
    ],
  },
]
