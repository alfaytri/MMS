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
          { label: 'Inventory',     href: '/master-data/inventory',  icon: 'Package',     permission: 'inventory.catalog.view' },
          { label: 'Warehouses',    href: '/master-data/warehouses', icon: 'Warehouse',   permission: 'warehouse.access' },
          { label: 'Users & Roles', href: '/master-data/users',     icon: 'UserCog',     permission: ['master_data.users.view', 'master_data.roles.view'] },
          { label: 'Audit Trail',  href: '/master-data/audit-trail', icon: 'ScrollText',  permission: 'master_data.audit.view' },
          { label: 'Admin',        href: '/master-data/admin',      icon: 'Settings',    permission: 'master_data.admin.view' },
        ],
      },
      {
        label: 'FIELD SERVICE',
        items: [
          { label: 'Service Customers',     href: '/master-data/service-customers', icon: 'Headset',    permission: 'master_data.service_customers.view' },
          { label: 'Services',              href: '/master-data/services',          icon: 'Wrench',     permission: 'master_data.services.view' },
          { label: 'Teams & Employees',     href: '/master-data/teams',             icon: 'UsersRound', permission: 'teams.view' },
          { label: 'Subscription Packages', href: '/master-data/subscriptions',     icon: 'CreditCard', permission: 'master_data.subscriptions.view' },
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
          { label: 'Financial Dashboard',   href: '/reports/dashboard',              icon: 'LayoutDashboard', permission: ['reports.view', 'reports.dashboard.view'] },
          { label: 'Product Profitability', href: '/reports/product-profitability',  icon: 'TrendingUp',      permission: ['reports.view', 'reports.product_profitability.view'] },
          { label: 'Product Cost',          href: '/reports/product-cost',           icon: 'Package',         permission: 'reports.product_cost.view' },
          { label: 'Revenue & COGS',        href: '/reports/revenue-cogs',           icon: 'Calculator',      permission: 'reports.revenue_cogs.view' },
          { label: 'Accounts Receivable',   href: '/reports/receivables',            icon: 'Receipt',         permission: 'reports.receivables.view' },
          { label: 'Accounts Payable',      href: '/reports/payables',               icon: 'Wallet',          permission: 'reports.payables.view' },
          { label: 'Cash & Cash Equivalents', href: '/reports/cash',                icon: 'HandCoins',       permission: 'reports.cash.view' },
          { label: 'Profit & Loss',         href: '/reports/profit-loss',            icon: 'BarChart3',       permission: 'reports.profit_loss.view' },
          { label: 'Consumption',           href: '/reports/project-consumption',    icon: 'Flame',           permission: ['reports.view', 'reports.project_consumption.view', 'consumption.cost.view'] },
          { label: 'Overtime',              href: '/reports/overtime',               icon: 'Clock',           permission: 'reports.view' },
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
          { label: 'Aging Report',    href: '/purchase/aging-report', icon: 'Clock',         permission: ['purchase.bills.view', 'purchase.aging.view'] },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders',  href: '/sales/orders',        icon: 'ShoppingBag',  permission: 'sales.orders.view' },
          { label: 'Approvals',    href: '/sales/approvals',     icon: 'ShieldCheck',  permission: 'sales.approvals.view' },
          { label: 'SO Invoices',  href: '/sales/invoices',      icon: 'FileText',     permission: 'sales.invoices.view' },
          { label: 'Returns',      href: '/sales/returns',       icon: 'RotateCcw',    permission: 'sales.returns.view' },
          { label: 'Warranties',   href: '/sales/warranties',    icon: 'ShieldCheck',  permission: 'sales.warranties.view' },
          { label: 'Deliveries',   href: '/sales/deliveries',    icon: 'PackageCheck', permission: 'sales.deliveries.view' },
          { label: 'Credit Notes',        href: '/sales/credit-notes',        icon: 'FileX',       permission: 'sales.credit_notes.view' },
          { label: 'Customer Statement', href: '/sales/customer-statement', icon: 'ScrollText', permission: ['sales.invoices.view', 'sales.customer_statement.view'] },
          { label: 'Aging Report',       href: '/sales/aging-report',       icon: 'Clock',       permission: ['sales.invoices.view', 'sales.aging.view'] },
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
    ],
  },
  {
    label: 'Orders',
    icon: 'ShoppingCart',
    permission: 'orders.access',
    groups: [
      {
        items: [
          { label: 'View Orders',  href: '/orders',        icon: 'List',       permission: 'orders.view' },
          { label: 'Create Order', href: '/orders/create', icon: 'PlusCircle', permission: 'orders.manage' },
        ],
      },
      {
        label: 'Order Quotations',
        items: [
          { label: 'View Order Quotations',  href: '/quotations',        icon: 'FileSearch', permission: 'quotations.view' },
          { label: 'Create Order Quotation', href: '/quotations/create', icon: 'FilePlus',   permission: 'quotations.manage' },
        ],
      },
    ],
  },
  {
    label: 'Invoices',
    icon: 'FileText',
    permission: 'invoices.access',
    groups: [
      {
        items: [
          { label: 'View Invoices',    href: '/invoices',                  icon: 'FileText', permission: 'invoices.view' },
          { label: 'Pending Payments', href: '/invoices/pending-payments', icon: 'Clock',    permission: 'payments.view' },
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
          { label: 'Draft Quotations', href: '/contracts/quotations',       icon: 'FileSearch', permission: 'contracts.quotations.view' },
          { label: 'Live Contracts',   href: '/contracts',                  icon: 'FileCheck',  permission: 'contracts.live.view' },
          { label: 'Create Quotation', href: '/contracts/create-quotation', icon: 'FilePlus',   permission: 'contracts.quotations.manage' },
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
          { label: 'Map',         href: '/map',         icon: 'MapPin',   permission: 'teams.map.view' },
          { label: 'Calendar',    href: '/calendar',    icon: 'Calendar', permission: 'calendar.view' },
          { label: 'Team Leader', href: '/team-leader', icon: 'Crown',    permission: 'teams.team_leader.view' },
        ],
      },
    ],
  },
  {
    label: 'Operations',
    icon: 'Flame',
    permission: 'operations.access',
    groups: [
      {
        items: [
          { label: 'Custody',        href: '/warehouse/custody',        icon: 'HandCoins',     permission: 'custody.view' },
          { label: 'Consumption',    href: '/consumption',              icon: 'Flame',         permission: 'consumption.view' },
          { label: 'Damaged Stock',  href: '/warehouse/damaged-stock',  icon: 'AlertTriangle', permission: ['damaged_stock.on_hand.view', 'damaged_stock.out_for_repair.view'] },
          { label: 'Tools & Assets', href: '/warehouse/tools-assets',   icon: 'Wrench',        permission: 'tools.assets.view' },
          // Picture Transfer (v2) — picture-first Send/Receive for low-literacy
          // warehouse staff. Lives under Operations; a user whose role holds ONLY
          // warehouse.transfer.simple still sees it because the Operations
          // dropdown shows whenever any child page is accessible (NavDropdown
          // filters items by their own permission, not the dropdown's).
          { label: 'Picture Transfer', href: '/warehouse/picture-transfer', icon: 'ArrowRightLeft', permission: 'warehouse.transfer.simple' },
        ],
      },
    ],
  },
]

/**
 * The first nav destination a user can open, walking NAV_ITEMS in display order
 * (Master Data → Reports → Purchase & Sales → Operations → Transfer). Used as
 * the landing page for a user whose role can't open the Dashboard: instead of a
 * blank dashboard they're sent to the first page their permissions allow (e.g. a
 * custody-only "teams" user lands on /warehouse/custody).
 *
 * `canAccess` mirrors useHasPermission semantics — pass a closure that returns
 * true for a system admin and for any-of a held permission. An item with no
 * `permission` is treated as accessible. Returns null when nothing is reachable.
 */
export function firstAccessibleHref(
  canAccess: (permission: string | string[] | undefined) => boolean,
): string | null {
  for (const entry of NAV_ITEMS) {
    for (const group of entry.groups) {
      for (const item of group.items) {
        if (item.comingSoon) continue
        if (canAccess(item.permission)) return item.href
      }
    }
  }
  return null
}
