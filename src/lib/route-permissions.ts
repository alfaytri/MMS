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
  // Finer per-sub-page guards (longest-prefix wins) — the AdminSidebar only HID
  // these links; without these a user holding just master_data.admin.view could
  // still reach them by direct URL. Keys match the sidebar's nav gating. (2026-08-19)
  { pathPrefix: '/master-data/admin/warehouses',             permission: 'master_data.warehouses.manage' },
  { pathPrefix: '/master-data/admin/custody',                permission: 'master_data.warehouses.manage' },
  { pathPrefix: '/master-data/admin/repair-vendors',         permission: 'master_data.warehouses.manage' },
  { pathPrefix: '/master-data/admin/approval-settings',      permission: 'purchase.approvals.chain.manage' },
  { pathPrefix: '/master-data/admin/credit-group-approvals', permission: 'master_data.customers.view' },
  { pathPrefix: '/master-data/services/approvals', permission: 'master_data.services.approve' },
  { pathPrefix: '/master-data/services',           permission: 'master_data.services.view' },
  { pathPrefix: '/master-data/service-customers',  permission: 'master_data.service_customers.view' },
  { pathPrefix: '/master-data/customers',          permission: 'master_data.customers.view' },
  { pathPrefix: '/master-data/suppliers',          permission: 'master_data.suppliers.view' },
  { pathPrefix: '/master-data/inventory',          permission: 'inventory.catalog.view' },
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
  { pathPrefix: '/purchase/returns',           permission: 'purchase.returns.view' },
  { pathPrefix: '/purchase/debit-notes',       permission: 'purchase.debit_notes.view' },
  { pathPrefix: '/purchase/dead-stock',        permission: 'purchase.dead_stock.view' },
  { pathPrefix: '/purchase/payments',          permission: 'purchase.payments.view' },
  { pathPrefix: '/purchase/aging-report',      permission: ['purchase.bills.view', 'purchase.aging.view'] },
  { pathPrefix: '/master-data/warehouses',     permission: 'warehouse.access' },
  { pathPrefix: '/purchase/edit-po',           permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/create-po',         permission: 'purchase.orders.manage' },
  { pathPrefix: '/purchase/orders',            permission: 'purchase.orders.view' },

  // ── Sales ──────────────────────────────────────────────────────────────
  { pathPrefix: '/sales/approvals',          permission: 'sales.approvals.view' },
  { pathPrefix: '/sales/credit-notes',       permission: 'sales.credit_notes.view' },
  { pathPrefix: '/sales/deliveries',         permission: 'sales.deliveries.view' },
  { pathPrefix: '/sales/invoices',           permission: 'sales.invoices.view' },
  { pathPrefix: '/sales/returns',            permission: 'sales.returns.view' },
  { pathPrefix: '/sales/warranties',         permission: 'sales.warranties.view' },
  { pathPrefix: '/sales/customer-statement', permission: ['sales.invoices.view', 'sales.customer_statement.view'] },
  { pathPrefix: '/sales/aging-report',       permission: ['sales.invoices.view', 'sales.aging.view'] },
  { pathPrefix: '/sales/edit-so',            permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/create-so',    permission: 'sales.orders.manage' },
  { pathPrefix: '/sales/orders',       permission: 'sales.orders.view' },

  // ── Operations ─────────────────────────────────────────────────────────
  // Most-specific first: /consumption/warranties must precede the generic
  // /consumption prefix so it resolves to the warranty-view key, not consumption.view.
  { pathPrefix: '/consumption/warranties',   permission: 'consumption.warranties.view' },
  { pathPrefix: '/consumption/returns',      permission: 'consumption.returns.view' },
  { pathPrefix: '/consumption',              permission: 'consumption.view' },
  { pathPrefix: '/warehouse/custody',        permission: 'custody.view' },
  { pathPrefix: '/warehouse/damaged-stock',  permission: ['damaged_stock.on_hand.view', 'damaged_stock.out_for_repair.view'] },
  { pathPrefix: '/warehouse/picture-transfer', permission: 'warehouse.transfer.simple' },

  // ── Teams / Map / Calendar / Team Leader ──────────────────────────────
  { pathPrefix: '/map',         permission: 'teams.map.view' },
  { pathPrefix: '/calendar',    permission: 'calendar.view' },
  { pathPrefix: '/team-leader', permission: 'teams.team_leader.view' },

  // ── Reports (per-report gating; longest matching prefix wins, ANY-of) ────
  { pathPrefix: '/reports/dashboard',             permission: ['reports.view', 'reports.dashboard.view'] },
  { pathPrefix: '/reports/product-profitability', permission: ['reports.view', 'reports.product_profitability.view'] },
  { pathPrefix: '/reports/product-cost',          permission: 'reports.product_cost.view' },
  { pathPrefix: '/reports/revenue-cogs',          permission: 'reports.revenue_cogs.view' },
  { pathPrefix: '/reports/receivables',           permission: 'reports.receivables.view' },
  { pathPrefix: '/reports/payables',              permission: 'reports.payables.view' },
  { pathPrefix: '/reports/cash',                  permission: 'reports.cash.view' },
  { pathPrefix: '/reports/profit-loss',           permission: 'reports.profit_loss.view' },
  { pathPrefix: '/reports/project-consumption',   permission: ['reports.view', 'reports.project_consumption.view', 'consumption.cost.view'] },
  // Section root / catch-all: any single report key admits you to /reports.
  { pathPrefix: '/reports', permission: ['reports.view', 'reports.dashboard.view', 'reports.product_profitability.view', 'reports.product_cost.view', 'reports.revenue_cogs.view', 'reports.receivables.view', 'reports.payables.view', 'reports.cash.view', 'reports.profit_loss.view', 'reports.project_consumption.view', 'consumption.cost.view'] },

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
