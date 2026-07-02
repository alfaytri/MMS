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
          { label: 'Warehouses',              href: '/purchase/warehouses',               icon: 'Warehouse',   permission: 'warehouse.access' },
          { label: 'Users & Roles',           href: '/master-data/users',                 icon: 'UserCog',     permission: ['master_data.users.view', 'master_data.roles.view'] },
          { label: 'Credit Group Approvals',  href: '/master-data/credit-group-approvals', icon: 'CheckSquare', permission: 'master_data.customers.view' },
          { label: 'Audit Trail',             href: '/master-data/audit-trail',           icon: 'ScrollText',  permission: 'master_data.audit.view' },
          { label: 'Admin',                   href: '/master-data/admin',                 icon: 'Settings',    permission: 'master_data.admin.view' },
        ],
      },
      {
        items: [
          { label: 'Service Customers', href: '/master-data/service-customers', icon: 'Headset',     permission: 'master_data.service_customers.view' },
          { label: 'Services',          href: '/master-data/services',          icon: 'Wrench',      permission: 'master_data.services.view' },
          { label: 'Teams & Employees', href: '/master-data/teams',             icon: 'UsersRound',  permission: 'teams.view' },
          { label: 'Subscription Packages', href: '/master-data/subscriptions', icon: 'CreditCard',  permission: 'master_data.subscriptions.view' },
          { label: 'QuickBooks', href: '/master-data/quickbooks', icon: 'BookOpen', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', icon: 'Bell', comingSoon: true },
        ],
      },
    ],
  },
  {
    label: 'Orders',
    icon: 'ShoppingCart',
    permission: 'orders.access',
    groups: [
      {
        items: [
          { label: 'View Orders',  href: '/orders',        icon: 'List',     permission: 'orders.view' },
          { label: 'Create Order', href: '/orders/create',  icon: 'PlusCircle', permission: 'orders.manage' },
        ],
      },
      {
        label: 'Order Quotations',
        items: [
          { label: 'View Order Quotations',  href: '/quotations',        icon: 'FileSearch',  permission: 'quotations.view' },
          { label: 'Create Order Quotation', href: '/quotations/create',  icon: 'FilePlus',    permission: 'quotations.manage' },
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
        label: 'ORDERS & CONTRACTS',
        items: [
          { label: 'View Invoices',     href: '/invoices',                  icon: 'FileText',    permission: 'invoices.view' },
          { label: 'Pending Payments',  href: '/invoices/pending-payments', icon: 'Clock',       permission: 'payments.view' },
        ],
      },
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
    label: 'Contracts',
    icon: 'FileText',
    permission: 'contracts.access',
    groups: [
      {
        items: [
          { label: 'Draft Quotations', href: '/contracts/quotations',       icon: 'FileSearch',  permission: 'contracts.quotations.view' },
          { label: 'Live Contracts',  href: '/contracts',                  icon: 'FileCheck',   permission: 'contracts.live.view' },
          { label: 'Create Quotation', href: '/contracts/create-quotation', icon: 'FilePlus',   permission: 'contracts.quotations.manage' },
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
  {
    label: 'Teams',
    icon: 'Users',
    permission: 'teams.access',
    groups: [
      {
        items: [
          { label: 'Map',         href: '/map',         icon: 'MapPin',    permission: 'teams.map.view' },
          { label: 'Calendar',    href: '/calendar',    icon: 'Calendar',  permission: 'calendar.view' },
          { label: 'Team Leader', href: '/team-leader', icon: 'Crown',     permission: 'teams.team_leader.view' },
        ],
      },
    ],
  },
  {
    label: 'Reports',
    icon: 'BarChart2',
    permission: 'reports.access',
    groups: [
      {
        items: [
          { label: 'Overtime', href: '/reports/overtime', icon: 'Clock', permission: 'reports.view' },
        ],
      },
    ],
  },
]
