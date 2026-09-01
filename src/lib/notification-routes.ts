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
  // service_change_approved / _rejected removed 2026-08-13 — the approve/reject
  // feature was never built (no RPC/UI emits them). Re-add when it is.

  // ── Warehouse Transfers ──────────────────────────────────────
  transfer_pending:         { route: '/master-data/warehouses', actionable: true, icon: 'transfer' },
  transfer_dispatched:      { route: '/master-data/warehouses', actionable: true, icon: 'transfer' },
  transfer_received:        { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },
  transfer_received_shrinkage: { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },
  transfer_rejected:        { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },
  transfer_cancelled:       { route: '/master-data/warehouses', actionable: false, icon: 'transfer' },

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

  // ── Warehouse Item Requests ──────────────────────────────────
  item_request:             { route: '/master-data/warehouses?tab=item-requests', actionable: true, icon: 'stock' },

  // ── Notifications expansion (2026-08-26) · Phase 1 ───────────
  // Action-needed → role holders
  so_approval_requested:    { route: '/sales/approvals',   actionable: true,  icon: 'so' },
  sale_return_created:      { route: '/sales/returns',     actionable: true,  icon: 'so' },
  warranty_claim_filed:     { route: '/sales/warranties',  actionable: true,  icon: 'info' },
  // Status/outcome → document owner
  po_goods_received:        { route: '/purchase/receivals', actionable: false, icon: 'receival' },
  shipment_delayed:         { route: '/purchase/shipments', actionable: false, icon: 'po' },
  // Scheduled (daily cron) → finance
  invoice_overdue:          { route: '/sales/invoices',    actionable: true,  icon: 'credit' },

  // ── Notifications expansion (2026-08-26) · Phase 2 ───────────
  // Status/outcome → document owner
  customer_payment_received: { route: '/sales/invoices',   actionable: false, icon: 'credit' },
  supplier_payment_made:     { route: '/purchase/bills',   actionable: false, icon: 'credit' },
  invoice_generated:         { route: '/sales/invoices',   actionable: false, icon: 'credit' },
  invoice_paid:              { route: '/sales/invoices',   actionable: false, icon: 'credit' },
  delivery_completed:        { route: '/sales/deliveries', actionable: false, icon: 'so' },
  credit_note_issued:        { route: '/sales/credit-notes', actionable: false, icon: 'credit' },
  debit_note_issued:         { route: '/purchase/debit-notes', actionable: false, icon: 'credit' },
  po_fully_received:         { route: '/purchase/orders',  actionable: false, icon: 'receival' },
  supplier_bill_created:     { route: '/purchase/bills',   actionable: false, icon: 'receival' },
  // Scheduled (daily cron)
  installment_due:           { route: '/sales/invoices',   actionable: true,  icon: 'credit' },
  supplier_bill_due:         { route: '/purchase/bills',   actionable: true,  icon: 'credit' },

  // ── Notifications expansion (2026-08-26) · Phase 3 ───────────
  po_return_resolved:        { route: '/purchase/debit-notes', actionable: false, icon: 'credit' },
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

/**
 * Phase-2 recipient coupling — the single source of truth mapping each
 * archetype-A (request / actionable) notification type to the feature
 * permission whose holders should receive it. Resolved at each creation
 * site via `getRecipientsForPermission()` (client) or the
 * `recipients_for_permission` RPC (DB-side).
 *
 * - `warehouseScoped`: perm-holders are narrowed to the relevant warehouse's RPs.
 * - `override`: a permission whose holders are always included (cross-warehouse).
 *
 * Archetype-B (outcome) types are intentionally absent: their recipient is the
 * original requester, known by identity at the creation site.
 *
 * DB-side types (`item_request`, `low_stock_alert`, `service_change_pending`)
 * are resolved inside their SQL creators, not here.
 */
export const NOTIFICATION_RECIPIENTS: Record<
  string,
  { permission: string; warehouseScoped?: boolean; override?: string; notifyKey?: string }
> = {
  po_approval_requested:   { permission: 'purchase.approvals.view', notifyKey: 'notify.purchase.po_approval' },
  po_edit_request_pending: { permission: 'purchase.approvals.view', notifyKey: 'notify.purchase.po_approval' },
  receival_edit_request:   { permission: 'purchase.receivals.manage', notifyKey: 'notify.purchase.receival_edit' },
  transfer_pending:        { permission: 'warehouse.transfer.dispatch', warehouseScoped: true, override: 'warehouse.transfer.approve', notifyKey: 'notify.warehouse.transfers' },
  transfer_dispatched:     { permission: 'warehouse.transfer.receive',  warehouseScoped: true, override: 'warehouse.transfer.approve', notifyKey: 'notify.warehouse.transfers' },
  stock_adj_pending:       { permission: 'warehouse.adjustments.view', notifyKey: 'notify.warehouse.stock_adj' },
  inv_check_pending:       { permission: 'warehouse.checks.view', notifyKey: 'notify.warehouse.inv_check' },
  credit_group_pending:    { permission: 'master_data.customers.change_credit_group', notifyKey: 'notify.finance.credit_group' },

  // Notifications expansion (2026-08-26) · Phase 1 — action-needed + scheduled (role-routed)
  so_approval_requested:   { permission: 'sales.approvals.view',        notifyKey: 'notify.sales.so_approval' },
  sale_return_created:     { permission: 'sales.returns.manage',        notifyKey: 'notify.sales.return_created' },
  warranty_claim_filed:    { permission: 'sales.warranty_claims.manage', notifyKey: 'notify.sales.warranty_claim' },
  invoice_overdue:         { permission: 'sales.invoices.view',         notifyKey: 'notify.finance.invoice_overdue' },

  // Phase 2 — scheduled (role-routed). Owner-routed types (payments, notes,
  // delivery, bill-created) are emitted via notifyOwnerAndKey and are NOT here.
  installment_due:         { permission: 'sales.payments.view',         notifyKey: 'notify.finance.installment_due' },
  supplier_bill_due:       { permission: 'purchase.payments.view',      notifyKey: 'notify.finance.bill_due' },
}
