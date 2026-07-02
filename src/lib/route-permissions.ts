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
  { pathPrefix: '/master-data/users',              permission: ['master_data.users.view', 'master_data.roles.view'] },
  { pathPrefix: '/master-data/audit-trail',        permission: 'master_data.audit.view' },
  { pathPrefix: '/master-data/admin',              permission: 'master_data.admin.view' },
  { pathPrefix: '/master-data/services/approvals', permission: 'master_data.services.approve' },
  { pathPrefix: '/master-data/services',           permission: 'master_data.services.view' },
  { pathPrefix: '/master-data/service-customers',  permission: 'master_data.service_customers.view' },
  { pathPrefix: '/master-data/customers',          permission: 'master_data.customers.view' },
  { pathPrefix: '/master-data/suppliers',          permission: 'master_data.suppliers.view' },
  { pathPrefix: '/master-data/inventory',          permission: 'master_data.inventory.view' },
  { pathPrefix: '/master-data/teams',              permission: 'teams.view' },
  { pathPrefix: '/master-data/subscriptions',      permission: 'master_data.subscriptions.view' },
  { pathPrefix: '/master-data/import',             permission: 'system.import' },
  { pathPrefix: '/master-data/credit-groups',      permission: 'master_data.admin.view' },

  // ── Orders ─────────────────────────────────────────────────────────────
  { pathPrefix: '/orders/create-follow-up', permission: 'follow_ups.confirm' },
  { pathPrefix: '/orders/create',           permission: 'orders.manage' },
  { pathPrefix: '/orders',                  permission: 'orders.view' },

  // ── Quotations ─────────────────────────────────────────────────────────
  { pathPrefix: '/quotations/create', permission: 'quotations.manage' },
  { pathPrefix: '/quotations',        permission: 'quotations.view' },

  // ── Contracts ──────────────────────────────────────────────────────────
  { pathPrefix: '/contracts/create-quotation', permission: 'contracts.quotations.manage' },
  { pathPrefix: '/contracts/quotations',       permission: 'contracts.quotations.view' },
  { pathPrefix: '/contracts',                  permission: ['contracts.live.view', 'contracts.quotations.view'] },

  // ── Invoices & Payments ────────────────────────────────────────────────
  { pathPrefix: '/invoices/pending-payments', permission: 'payments.view' },
  { pathPrefix: '/invoices/payments',         permission: 'payments.view' },
  { pathPrefix: '/invoices',                  permission: 'invoices.view' },

  // ── Purchase ───────────────────────────────────────────────────────────
  { pathPrefix: '/purchase/approval-settings', permission: 'purchase.approvals.chain.manage' },
  { pathPrefix: '/purchase/approvals',         permission: 'purchase.approvals.view' },
  { pathPrefix: '/purchase/shipments',         permission: 'purchase.shipments.view' },
  { pathPrefix: '/purchase/receivals',         permission: 'purchase.receivals.view' },
  { pathPrefix: '/purchase/landed-costs',      permission: 'purchase.landed_costs.view' },
  { pathPrefix: '/purchase/bills',             permission: 'purchase.bills.view' },
  { pathPrefix: '/purchase/dead-stock',        permission: 'purchase.dead_stock.view' },
  { pathPrefix: '/purchase/payments',          permission: 'purchase.payments.view' },
  { pathPrefix: '/purchase/warehouses',        permission: 'warehouse.access' },
  { pathPrefix: '/purchase/edit-po',           permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/create-po',         permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/orders',            permission: 'purchase.orders.view' },

  // ── Sales ──────────────────────────────────────────────────────────────
  { pathPrefix: '/sales/credit-notes', permission: 'sales.credit_notes.view' },
  { pathPrefix: '/sales/deliveries',   permission: 'sales.deliveries.view' },
  { pathPrefix: '/sales/invoices',     permission: 'sales.invoices.view' },
  { pathPrefix: '/sales/returns',      permission: 'sales.returns.view' },
  { pathPrefix: '/sales/edit-so',      permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/create-so',    permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/orders',       permission: 'sales.orders.view' },

  // ── Teams / Map / Calendar / Team Leader ──────────────────────────────
  { pathPrefix: '/map',         permission: 'teams.map.view' },
  { pathPrefix: '/calendar',    permission: 'calendar.view' },
  { pathPrefix: '/team-leader', permission: 'teams.team_leader.view' },

  // ── Reports ────────────────────────────────────────────────────────────
  { pathPrefix: '/reports', permission: 'reports.view' },

  // /admin/* is already gated server-side by src/app/(dashboard)/admin/layout.tsx
  // (Contact Centre admin pages). No entry needed here.
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
