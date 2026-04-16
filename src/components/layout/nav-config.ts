import {
  Database,
  ShoppingCart,
  FileText,
  Receipt,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react'

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
  icon: LucideIcon
  comingSoon?: boolean
  groups: NavGroup[]
}

export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: Database,
    groups: [
      {
        items: [
          { label: 'Companies & Divisions', href: '/master-data/companies' },
          { label: 'Warehouses', href: '/master-data/warehouses' },
          { label: 'Inventory Items', href: '/master-data/inventory' },
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail', href: '/master-data/audit-trail' },
          { label: 'Admin', href: '/master-data/admin' },
        ],
      },
      {
        items: [
          { label: 'Service List', href: '/master-data/services', comingSoon: true },
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
    icon: ShoppingCart,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Contracts',
    icon: FileText,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Invoices',
    icon: Receipt,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Purchase & Sales',
    icon: ShoppingBag,
    groups: [
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Approvals', href: '/purchase/approvals' },
          { label: 'Shipments', href: '/purchase/shipments' },
          { label: 'Landed Costs', href: '/purchase/landed-costs' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock' },
          { label: 'Warehouses', href: '/purchase/warehouses' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Create Sale Order', href: '/sales/create' },
          { label: 'Sale Orders', href: '/sales/orders' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
    ],
  },
  {
    label: 'Teams',
    icon: Users,
    comingSoon: true,
    groups: [],
  },
]
