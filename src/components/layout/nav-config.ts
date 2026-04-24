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
          { label: 'Inventory Items', href: '/master-data/inventory' },
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Warehouses', href: '/purchase/warehouses' },
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail', href: '/master-data/audit-trail' },
          { label: 'Admin', href: '/master-data/admin' },
          { label: 'Approval Settings', href: '/purchase/approval-settings' },
        ],
      },
      {
        items: [
          { label: 'Services', href: '/master-data/services' },
          { label: 'Team & Employee', href: '/master-data/teams', comingSoon: true },
          { label: 'Subscription Packages', href: '/master-data/subscriptions', comingSoon: true },
          { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
        ],
      },
    ],
  },
  {
    label: 'Orders',
    icon: 'ShoppingCart',
    comingSoon: true,
    groups: [],
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
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Receivals', href: '/purchase/receivals' },
          { label: 'Purchase Payments', href: '/purchase/payments' },
        ],
      },
      {
        // separator group — rendered as a thin HR by NavDropdown
        items: [
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
          { label: 'Deliveries', href: '/sales/deliveries' },
          { label: 'Invoices', href: '/sales/invoices' },
          { label: 'Payments', href: '/sales/payments' },
          { label: 'Credit Notes', href: '/sales/credit-notes' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
    ],
  },
  {
    label: 'Teams',
    icon: 'Users',
    comingSoon: true,
    groups: [],
  },
]
