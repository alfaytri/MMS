// src/components/layout/nav-config.ts
export type NavItem = {
  label: string
  href: string
  comingSoon?: boolean
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export type NavEntry = {
  label: string
  icon: string
  comingSoon?: boolean
  groups: NavGroup[]
}

export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: 'Database',
    groups: [
      {
        items: [
          { label: 'Warehouses',    href: '/purchase/warehouses' },
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail',   href: '/master-data/audit-trail' },
          { label: 'Admin',         href: '/master-data/admin' },
        ],
      },
      {
        items: [
          { label: 'Service Customers', href: '/master-data/service-customers' },
          { label: 'Services', href: '/master-data/services' },
          { label: 'Teams & Employees', href: '/master-data/teams' },
          { label: 'Subscription Packages', href: '/master-data/subscriptions' },
          { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
        ],
      },
    ],
  },
  {
    label: 'Orders',
    icon: 'ShoppingCart',
    groups: [
      {
        items: [
          { label: 'View Orders', href: '/orders' },
          { label: 'Create Order', href: '/orders/create' },
        ],
      },
      {
        label: 'Quotations',
        items: [
          { label: 'View Quotations', href: '/quotations' },
          { label: 'Create Quotation', href: '/quotations/create' },
        ],
      },
    ],
  },
  {
    label: 'Contracts',
    icon: 'FileText',
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Purchase & Sales',
    icon: 'ShoppingBag',
    groups: [
      {
        label: 'Vendors & Clients',
        items: [
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Customers', href: '/master-data/customers' },
        ],
      },
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Approvals', href: '/purchase/approvals' },
          { label: 'Shipments', href: '/purchase/shipments' },
          { label: 'Landed Costs', href: '/purchase/landed-costs' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders', href: '/sales/orders' },
          { label: 'Invoices', href: '/sales/invoices' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
      {
        // common divider — shared purchase & sales transactions
        items: [
          { label: 'Receivals', href: '/purchase/receivals' },
          { label: 'Payments', href: '/purchase/payments' },
          { label: 'Deliveries', href: '/sales/deliveries' },
          { label: 'Credit Notes', href: '/sales/credit-notes' },
        ],
      },
    ],
  },
  {
    label: 'Teams',
    icon: 'Users',
    groups: [
      {
        items: [
          { label: 'Calendar', href: '/calendar' },
        ],
      },
    ],
  },
]
