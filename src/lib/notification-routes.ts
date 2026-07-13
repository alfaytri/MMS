/**
 * Maps notification types to their destination routes and whether they
 * require user action (actionable = true means they stay in Pending
 * until the user completes the workflow action).
 */

type NotificationMeta = {
  route: string | ((relatedId: string | null) => string)
  actionable: boolean
  icon: 'po' | 'so' | 'service' | 'transfer' | 'stock' | 'inventory' | 'credit' | 'receival' | 'info'
}

const NOTIFICATION_ROUTES: Record<string, NotificationMeta> = {
  // ── PO Approvals ─────────────────────────────────────────────
  po_approval_requested:    { route: '/purchase/approvals', actionable: true, icon: 'po' },
  po_approved:              { route: '/purchase/approvals', actionable: false, icon: 'po' },
  po_rejected:              { route: '/purchase/approvals', actionable: false, icon: 'po' },

  // ── PO Edit Requests ─────────────────────────────────────────
  po_edit_request_pending:  { route: '/purchase/approvals', actionable: true, icon: 'po' },
  po_edit_request_approved: { route: '/purchase/approvals', actionable: false, icon: 'po' },
  po_edit_request_declined: { route: '/purchase/approvals', actionable: false, icon: 'po' },

  // ── Sales Approvals ──────────────────────────────────────────
  so_approved:              { route: '/sales/approvals', actionable: false, icon: 'so' },
  so_rejected:              { route: '/sales/approvals', actionable: false, icon: 'so' },

  // ── Service Changes ──────────────────────────────────────────
  service_change_pending:   { route: '/master-data/services/approvals', actionable: true, icon: 'service' },
  service_change_approved:  { route: '/master-data/services/approvals', actionable: false, icon: 'service' },
  service_change_rejected:  { route: '/master-data/services/approvals', actionable: false, icon: 'service' },

  // ── Warehouse Transfers ──────────────────────────────────────
  transfer_pending:         { route: '/master-data/warehouses', actionable: true, icon: 'transfer' },
  transfer_dispatched:      { route: '/master-data/warehouses', actionable: true, icon: 'transfer' },
  transfer_received:        { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },
  transfer_received_shrinkage: { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },

  // ── Stock Adjustments ────────────────────────────────────────
  stock_adj_pending:        { route: '/master-data/warehouses', actionable: true, icon: 'stock' },
  stock_adj_approved:       { route: '/master-data/warehouses', actionable: false, icon: 'stock' },
  stock_adj_rejected:       { route: '/master-data/warehouses', actionable: false, icon: 'stock' },

  // ── Inventory Checks ────────────────────────────────────────
  inv_check_pending:        { route: '/master-data/warehouses', actionable: true, icon: 'inventory' },
  inv_check_approved:       { route: '/master-data/warehouses', actionable: false, icon: 'inventory' },
  inv_check_rejected:       { route: '/master-data/warehouses', actionable: false, icon: 'inventory' },

  // ── Credit Group ─────────────────────────────────────────────
  credit_group_pending:     { route: '/master-data/credit-group-approvals', actionable: true, icon: 'credit' },
  credit_group_approved:    { route: '/master-data/credit-group-approvals', actionable: false, icon: 'credit' },
  credit_group_rejected:    { route: '/master-data/credit-group-approvals', actionable: false, icon: 'credit' },

  // ── Receival Edits ───────────────────────────────────────────
  receival_edit_request:    { route: '/master-data/warehouses', actionable: true, icon: 'receival' },
  receival_edit_response:   { route: '/master-data/warehouses', actionable: false, icon: 'receival' },

  // ── Low Stock Alert ──────────────────────────────────────────
  low_stock_alert:          { route: '/master-data/warehouses', actionable: false, icon: 'stock' },
}

export function getNotificationRoute(type: string, relatedId: string | null): string | null {
  const meta = NOTIFICATION_ROUTES[type]
  if (!meta) return null
  return typeof meta.route === 'function' ? meta.route(relatedId) : meta.route
}

export function isActionableNotification(type: string): boolean {
  return NOTIFICATION_ROUTES[type]?.actionable ?? false
}

export function getNotificationIcon(type: string): NotificationMeta['icon'] {
  return NOTIFICATION_ROUTES[type]?.icon ?? 'info'
}
