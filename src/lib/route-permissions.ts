/**
 * Route → permission map.
 *
 * The TopNav only HIDES items the user can't access — it never blocks
 * direct URL navigation. This map is the single source of truth for what
 * permission each pathname requires, and is enforced by
 * <RoutePermissionGuard> inside (dashboard)/layout.tsx.
 *
 * Entries must use the most specific prefix first (longer prefix wins).
 * Pathnames matching no entry are considered unprotected (e.g. '/').
 */
export type RoutePermission = {
  pathPrefix: string
  permission: string | string[]
}

export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // ── Master Data ────────────────────────────────────────────────────────
  { pathPrefix: '/master-data/users',         permission: ['master_data.users.view', 'master_data.roles.view'] },
  { pathPrefix: '/master-data/audit-trail',   permission: 'master_data.audit.view' },
  { pathPrefix: '/master-data/admin',         permission: 'master_data.admin.view' },
  { pathPrefix: '/master-data/customers',     permission: 'master_data.customers.view' },
  { pathPrefix: '/master-data/suppliers',     permission: 'master_data.suppliers.view' },
  { pathPrefix: '/master-data/inventory',     permission: 'master_data.inventory.view' },
  { pathPrefix: '/master-data/import',        permission: 'system.import' },
  { pathPrefix: '/master-data/credit-groups', permission: 'master_data.admin.view' },

  // ── Finance ────────────────────────────────────────────────────────────
  { pathPrefix: '/finance', permission: 'invoices.access' },

  // ── Purchase ───────────────────────────────────────────────────────────
  { pathPrefix: '/purchase/approval-settings', permission: 'purchase.approvals.chain.manage' },
  { pathPrefix: '/purchase/approvals',         permission: 'purchase.approvals.view' },
  { pathPrefix: '/purchase/shipments',         permission: 'purchase.shipments.view' },
  { pathPrefix: '/purchase/receivals',         permission: 'purchase.receivals.view' },
  { pathPrefix: '/purchase/landed-costs',      permission: 'purchase.landed_costs.view' },
  { pathPrefix: '/purchase/bills',             permission: 'purchase.bills.view' },
  { pathPrefix: '/purchase/returns',           permission: 'purchase.returns.view' },
  { pathPrefix: '/purchase/debit-notes',       permission: 'purchase.debit_notes.view' },
  { pathPrefix: '/purchase/dead-stock',        permission: 'purchase.dead_stock.view' },
  { pathPrefix: '/purchase/payments',          permission: 'purchase.payments.view' },
  { pathPrefix: '/purchase/aging-report',      permission: 'purchase.bills.view' },
  { pathPrefix: '/purchase/warehouses',        permission: 'warehouse.access' },
  { pathPrefix: '/purchase/edit-po',           permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/create-po',         permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/orders',            permission: 'purchase.orders.view' },

  // ── Sales ──────────────────────────────────────────────────────────────
  { pathPrefix: '/sales/approvals',          permission: 'sales.approvals.view' },
  { pathPrefix: '/sales/credit-notes',       permission: 'sales.credit_notes.view' },
  { pathPrefix: '/sales/deliveries',         permission: 'sales.deliveries.view' },
  { pathPrefix: '/sales/invoices',           permission: 'sales.invoices.view' },
  { pathPrefix: '/sales/returns',            permission: 'sales.returns.view' },
  { pathPrefix: '/sales/customer-statement', permission: 'sales.invoices.view' },
  { pathPrefix: '/sales/aging-report',       permission: 'sales.invoices.view' },
  { pathPrefix: '/sales/edit-so',            permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/create-so',          permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/orders',             permission: 'sales.orders.view' },
]

/** Returns the permission(s) required for `pathname`, or null if unprotected. */
export function matchRequiredPermission(pathname: string): string | string[] | null {
  const sorted = [...ROUTE_PERMISSIONS].sort(
    (a, b) => b.pathPrefix.length - a.pathPrefix.length
  )
  for (const r of sorted) {
    if (pathname === r.pathPrefix || pathname.startsWith(r.pathPrefix + '/')) {
      return r.permission
    }
  }
  return null
}
