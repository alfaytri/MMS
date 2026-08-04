'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, Lock,
  Database, ShoppingBag, BarChart3, LayoutDashboard, Settings2,
  Package, Warehouse as WarehouseIcon, UserCog, ScrollText, Settings,
  Layers, ArrowRightLeft, ClipboardList, ClipboardCheck, TrendingUp,
  Activity, Truck, UserCheck, Building2, Wrench,
  Ship, Calculator, Receipt,
  PackageOpen, FileX2, RotateCcw, FileText, PackageCheck,
  CheckCircle, ShieldCheck, Upload, Download,
  Flame, HandCoins, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type PermEntry = { key: string; label: string; description: string }

export type TreeNode = {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  isGroupHeader?: boolean
  permissions?: PermEntry[]
  children?: TreeNode[]
}

export const NAV_TREE: TreeNode[] = [
  {
    id: 'master-data',
    label: 'Master Data',
    icon: Database,
    permissions: [
      { key: 'master_data.access', label: 'Access Master Data', description: 'Show the Master Data dropdown in the top nav' },
    ],
    children: [
      {
        id: 'md-inventory',
        label: 'Inventory',
        icon: Package,
        permissions: [
          { key: 'master_data.inventory.view',   label: 'View Inventory',   description: 'Browse inventory items, categories, and brand variants' },
          { key: 'master_data.inventory.create', label: 'Create Inventory', description: 'Add new inventory items, categories, and brand variants' },
          { key: 'master_data.inventory.manage', label: 'Edit Inventory',   description: 'Edit and delete existing inventory items and variants (legacy .manage — alias of .edit)' },
        ],
      },
      {
        id: 'md-warehouses',
        label: 'Warehouses',
        icon: WarehouseIcon,
        permissions: [
          { key: 'warehouse.access', label: 'Access Warehouse Module', description: 'Show the Warehouse link in Master Data and grant access to the warehouse page' },
          { key: 'purchase.warehouses.view', label: 'View Warehouse Operations', description: 'Access stock levels, movements, and transfers' },
          { key: 'purchase.warehouses.manage', label: 'Manage Warehouse Operations', description: 'Create transfers, adjustments, and inventory checks (legacy alias — deprecated)' },
          { key: 'warehouse.responsible_person', label: 'Warehouse RP (assignable)', description: 'Users holding this role can be assigned as a Warehouse Responsible Person for one or more warehouses (dispatch / receive transfers, count checks, etc.)' },
        ],
        children: [
          {
            id: 'md-wh-tab',
            label: 'Warehouses Tab',
            icon: WarehouseIcon,
            permissions: [
              { key: 'warehouse.warehouses.view', label: 'View Warehouses Tab', description: 'See the Warehouses tab listing physical warehouses' },
              { key: 'warehouse.settings.manage', label: 'Manage WH Settings', description: 'Edit warehouses, assign Warehouse RPs, configure reorder points' },
            ],
          },
          {
            id: 'md-wh-stock',
            label: 'Stock Overview',
            icon: Layers,
            permissions: [
              { key: 'warehouse.stock.view', label: 'View Stock Overview', description: 'See stock levels per warehouse and item' },
            ],
          },
          {
            id: 'md-wh-transfers',
            label: 'Transfers',
            icon: ArrowRightLeft,
            permissions: [
              { key: 'warehouse.transfers.view', label: 'View Transfers', description: 'See the Transfers tab and transfer history' },
              { key: 'warehouse.transfer.create', label: 'Create Transfers', description: 'Initiate stock transfers between warehouses' },
              { key: 'warehouse.transfer.dispatch', label: 'Dispatch Transfers', description: 'Approve items leaving a warehouse (Warehouse RP only)' },
              { key: 'warehouse.transfer.receive', label: 'Receive Transfers', description: 'Confirm items arriving at a warehouse (Warehouse RP only)' },
              { key: 'warehouse.transfer.approve', label: 'Override Transfers', description: 'Override/approve any transfer step (Inventory Manager)' },
            ],
          },
          {
            id: 'md-wh-adj',
            label: 'Adjustments',
            icon: ClipboardList,
            permissions: [
              { key: 'warehouse.adjustments.view', label: 'View Adjustments', description: 'See the Adjustments tab and history' },
              { key: 'warehouse.adjustment.request', label: 'Request Adjustments', description: 'Submit stock adjustment requests' },
            ],
          },
          {
            id: 'md-wh-checks',
            label: 'Inv. Checks',
            icon: ClipboardCheck,
            permissions: [
              { key: 'warehouse.checks.view', label: 'View Inv. Checks', description: 'See the Inv. Checks tab and history' },
              { key: 'warehouse.check.count', label: 'Count Inventory', description: 'Participate in inventory count checks' },
              { key: 'warehouse.check.create', label: 'Create Inv. Checks', description: 'Create and assign inventory check sessions' },
            ],
          },
          {
            id: 'md-wh-value',
            label: 'Stock Value',
            icon: TrendingUp,
            permissions: [
              { key: 'warehouse.stock_value.view', label: 'View Stock Value', description: 'See financial stock valuation per warehouse' },
            ],
          },
          {
            id: 'md-wh-movements',
            label: 'Movements',
            icon: Activity,
            permissions: [
              { key: 'warehouse.movements.view', label: 'View Movements', description: 'See the stock movement audit log' },
            ],
          },
          {
            id: 'md-wh-receivals',
            label: 'Receivals & Deliveries',
            icon: Truck,
            permissions: [
              { key: 'warehouse.receivals.view', label: 'View Receivals & Deliveries', description: 'See the receivals and deliveries summary' },
            ],
          },
        ],
      },
      {
        id: 'md-users',
        label: 'Users & Roles',
        icon: UserCog,
        permissions: [
          { key: 'master_data.users.view',   label: 'View Users',   description: 'Access the users list and profile details' },
          { key: 'master_data.users.create', label: 'Create Users', description: 'Add new users (invite / create account)' },
          { key: 'master_data.users.manage', label: 'Edit Users',   description: 'Edit, deactivate, and reset passwords for existing users (legacy .manage — alias of .edit)' },
          { key: 'master_data.roles.view',   label: 'View Roles',   description: 'Access the roles list and permission assignments' },
          { key: 'master_data.roles.create', label: 'Create Roles', description: 'Add new custom roles' },
          { key: 'master_data.roles.manage', label: 'Edit Roles',   description: 'Edit and delete existing custom roles (legacy .manage — alias of .edit)' },
        ],
      },
      {
        id: 'md-audit',
        label: 'Audit Trail',
        icon: ScrollText,
        permissions: [
          { key: 'master_data.audit.view', label: 'View Audit Trail', description: 'Access the activity log and audit history' },
        ],
      },
      {
        id: 'md-admin',
        label: 'Admin',
        icon: Settings,
        permissions: [
          { key: 'master_data.admin.view',   label: 'View Admin Settings',   description: 'Access the admin settings panel' },
          { key: 'master_data.admin.manage', label: 'Edit Admin Settings',   description: 'Edit admin settings including brand groups and reason lists (legacy .manage — alias of .edit)' },
        ],
        children: [
          {
            id: 'md-admin-companies',
            label: 'Companies & Divisions',
            icon: Building2,
            permissions: [
              { key: 'master_data.companies.view',   label: 'View Companies',   description: 'Access the companies list and details' },
              { key: 'master_data.companies.create', label: 'Create Companies', description: 'Add new company records' },
              { key: 'master_data.companies.manage', label: 'Edit Companies',   description: 'Edit and delete existing company records (legacy .manage — alias of .edit)' },
              { key: 'master_data.divisions.view',   label: 'View Divisions',   description: 'Access the divisions list and details' },
              { key: 'master_data.divisions.create', label: 'Create Divisions', description: 'Add new division records' },
              { key: 'master_data.divisions.manage', label: 'Edit Divisions',   description: 'Edit and delete existing division records (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'md-admin-wh-setup',
            label: 'Warehouses Setup',
            icon: WarehouseIcon,
            permissions: [
              { key: 'master_data.warehouses.view',   label: 'View Warehouses',   description: 'Access the warehouses list and details' },
              { key: 'master_data.warehouses.create', label: 'Create Warehouses', description: 'Add new warehouse records' },
              { key: 'master_data.warehouses.manage', label: 'Edit Warehouses',   description: 'Edit and delete existing warehouse records (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'md-admin-services',
            label: 'Services',
            icon: Wrench,
            permissions: [
              { key: 'master_data.services.view',    label: 'View Services',           description: 'Access the services catalog and pricing' },
              { key: 'master_data.services.create',  label: 'Create Services',         description: 'Add new service definitions' },
              { key: 'master_data.services.manage',  label: 'Edit Services',           description: 'Edit and delete existing service definitions (legacy .manage — alias of .edit)' },
              { key: 'master_data.services.approve', label: 'Approve Service Changes', description: 'Review and approve/reject service change requests' },
            ],
          },
          {
            id: 'md-admin-svc-cust',
            label: 'Service Customers',
            icon: UserCheck,
            permissions: [
              { key: 'master_data.service_customers.view',   label: 'View Service Customers',   description: 'Access the service customers list and details' },
              { key: 'master_data.service_customers.create', label: 'Create Service Customers', description: 'Add new service customer records' },
              { key: 'master_data.service_customers.manage', label: 'Edit Service Customers',   description: 'Edit and delete existing service customer records (legacy .manage — alias of .edit)' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'purchase-sales',
    label: 'Purchase & Sales',
    icon: ShoppingBag,
    permissions: [
      { key: 'purchase_sales.access', label: 'Access Purchase & Sales', description: 'Show the Purchase & Sales dropdown in the top nav' },
    ],
    children: [
      {
        id: 'ps-vendors',
        label: 'Vendors & Clients',
        icon: Building2,
        isGroupHeader: true,
        children: [
          {
            id: 'ps-suppliers',
            label: 'Suppliers',
            icon: Truck,
            permissions: [
              { key: 'master_data.suppliers.view',   label: 'View Suppliers',   description: 'Access the suppliers list and contact details' },
              { key: 'master_data.suppliers.create', label: 'Create Suppliers', description: 'Add new supplier records' },
              { key: 'master_data.suppliers.manage', label: 'Edit Suppliers',   description: 'Edit and delete existing supplier records (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-customers',
            label: 'Customers',
            icon: UserCheck,
            permissions: [
              { key: 'master_data.customers.view',                label: 'View Customers',       description: 'Access the customers list and details' },
              { key: 'master_data.customers.create',              label: 'Create Customers',     description: 'Add new customer records' },
              { key: 'master_data.customers.manage',              label: 'Edit Customers',       description: 'Edit and delete existing customer records (legacy .manage — alias of .edit)' },
              { key: 'master_data.customers.change_credit_group', label: 'Change Credit Group',  description: 'Move a customer between credit groups (typically Accounting Manager / Owner)' },
              { key: 'master_data.customers.change_type',         label: 'Change Customer Type', description: 'Switch Cash ↔ Credit or Individual ↔ Business (financial classification — requires updated docs)' },
            ],
          },
        ],
      },
      {
        id: 'ps-purchase',
        label: 'Purchase',
        icon: Download,
        isGroupHeader: true,
        children: [
          {
            id: 'ps-po',
            label: 'Purchase Orders',
            icon: ClipboardList,
            permissions: [
              { key: 'purchase.orders.view',   label: 'View Purchase Orders',   description: 'View all purchase orders and their details' },
              { key: 'purchase.orders.create', label: 'Create Purchase Orders', description: 'Draft new purchase orders' },
              { key: 'purchase.orders.manage', label: 'Edit Purchase Orders',   description: 'Edit line items, cancel, and manage existing purchase orders (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-approvals',
            label: 'Approvals',
            icon: CheckCircle,
            permissions: [
              { key: 'purchase.approvals.view', label: 'View Approvals Queue', description: 'Access the purchase order approvals queue' },
              { key: 'purchase.approvals.chain.manage', label: 'Manage Approval Chains', description: 'Configure approval chains, tiers, and role assignments' },
              { key: 'purchase.approvals.bypass', label: 'Bypass Approvals', description: 'Force-approve stuck purchase order approval steps' },
            ],
          },
          {
            id: 'ps-receivals',
            label: 'Receivals',
            icon: PackageOpen,
            permissions: [
              { key: 'purchase.receivals.view',   label: 'View Receivals',   description: 'Access receival records and goods inward' },
              { key: 'purchase.receivals.create', label: 'Create Receivals', description: 'Create new goods receivals' },
              { key: 'purchase.receivals.manage', label: 'Edit Receivals',   description: 'Edit and process existing receivals (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-bills',
            label: 'Bills',
            icon: Receipt,
            permissions: [
              { key: 'purchase.bills.view',   label: 'View Bills',   description: 'Access purchase bills and bill details' },
              { key: 'purchase.bills.create', label: 'Create Bills', description: 'Create new purchase bills' },
              { key: 'purchase.bills.manage', label: 'Edit Bills',   description: 'Edit existing purchase bills (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-returns',
            label: 'Returns',
            icon: RotateCcw,
            permissions: [
              { key: 'purchase.returns.view',   label: 'View Purchase Returns',   description: 'Access purchase return records' },
              { key: 'purchase.returns.create', label: 'Create Purchase Returns', description: 'Create new purchase return requests' },
              { key: 'purchase.returns.manage', label: 'Edit Purchase Returns',   description: 'Edit and process existing purchase return requests (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-debit-notes',
            label: 'Debit Notes',
            icon: FileX2,
            permissions: [
              { key: 'purchase.debit_notes.view', label: 'View Debit Notes', description: 'Access the purchase debit notes page' },
            ],
          },
        ],
      },
      {
        id: 'ps-sales',
        label: 'Sales',
        icon: Upload,
        isGroupHeader: true,
        children: [
          {
            id: 'ps-so',
            label: 'Sale Orders',
            icon: ShoppingBag,
            permissions: [
              { key: 'sales.orders.view',   label: 'View Sale Orders',   description: 'View all sale orders and quotations' },
              { key: 'sales.orders.create', label: 'Create Sale Orders', description: 'Draft new sale orders' },
              { key: 'sales.orders.manage', label: 'Edit Sale Orders',   description: 'Edit line items, cancel, void existing sale orders (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-sales-approvals',
            label: 'Approvals',
            icon: ShieldCheck,
            permissions: [
              { key: 'sales.approvals.view', label: 'View Sales Approvals', description: 'Access the sales approvals queue (margin + credit)' },
              { key: 'sales.approvals.manage', label: 'Act on Sales Approvals', description: 'Approve or reject sales approval slips' },
            ],
          },
          {
            id: 'ps-invoices',
            label: 'SO Invoices',
            icon: FileText,
            permissions: [
              { key: 'sales.invoices.view',   label: 'View Sales Invoices',   description: 'Access sales invoice records' },
              { key: 'sales.invoices.create', label: 'Create Sales Invoices', description: 'Generate new sales invoices' },
              { key: 'sales.invoices.manage', label: 'Edit Sales Invoices',   description: 'Edit and void existing sales invoices (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-sale-returns',
            label: 'Returns',
            icon: RotateCcw,
            permissions: [
              { key: 'sales.returns.view',   label: 'View Sale Returns',   description: 'Access sale return records' },
              { key: 'sales.returns.create', label: 'Create Sale Returns', description: 'Create new sale return requests' },
              { key: 'sales.returns.manage', label: 'Edit Sale Returns',   description: 'Edit and process existing sale return requests (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-deliveries',
            label: 'Deliveries',
            icon: PackageCheck,
            permissions: [
              { key: 'sales.deliveries.view',   label: 'View Deliveries',   description: 'Access delivery records and tracking' },
              { key: 'sales.deliveries.create', label: 'Create Deliveries', description: 'Create new delivery records' },
              { key: 'sales.deliveries.manage', label: 'Edit Deliveries',   description: 'Edit and update existing delivery records (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-credit-notes',
            label: 'Credit Notes',
            icon: FileX2,
            permissions: [
              { key: 'sales.credit_notes.view',   label: 'View Credit Notes',   description: 'Access credit and debit note records' },
              { key: 'sales.credit_notes.create', label: 'Create Credit Notes', description: 'Draft new credit and debit notes' },
              { key: 'sales.credit_notes.manage', label: 'Edit Credit Notes',   description: 'Edit and process existing credit and debit notes (legacy .manage — alias of .edit)' },
            ],
          },
        ],
      },
      {
        id: 'ps-logistics',
        label: 'Logistics & Reports',
        icon: Ship,
        isGroupHeader: true,
        children: [
          {
            id: 'ps-shipments',
            label: 'Shipments',
            icon: Ship,
            permissions: [
              { key: 'purchase.shipments.view',   label: 'View Shipments',   description: 'Track shipment status and events' },
              { key: 'purchase.shipments.create', label: 'Create Shipments', description: 'Create new shipments' },
              { key: 'purchase.shipments.manage', label: 'Edit Shipments',   description: 'Update tracking events and edit existing shipments (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-landed-costs',
            label: 'Landed Costs',
            icon: Calculator,
            permissions: [
              { key: 'purchase.landed_costs.view',   label: 'View Landed Costs',   description: 'View landed cost records and allocations' },
              { key: 'purchase.landed_costs.create', label: 'Create Landed Costs', description: 'Create new landed cost records' },
              { key: 'purchase.landed_costs.manage', label: 'Edit Landed Costs',   description: 'Edit and void existing landed cost records (legacy .manage — alias of .edit)' },
            ],
          },
          {
            id: 'ps-dead-stock',
            label: 'Dead Stock Report',
            icon: BarChart3,
            permissions: [
              { key: 'purchase.dead_stock.view', label: 'View Dead Stock Report', description: 'Access the dead stock and slow-moving inventory report' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Flame,
    permissions: [
      { key: 'operations.access', label: 'Access Operations Dropdown', description: 'Show the Operations dropdown in the top nav' },
    ],
    children: [
      {
        id: 'ops-custody',
        label: 'Custody',
        icon: HandCoins,
        permissions: [
          { key: 'custody.teams.view',  label: 'View Teams Custody',  description: 'See the Teams tab on the Custody page (stock in team custody)' },
          { key: 'custody.teams.edit',  label: 'Edit Teams Custody',  description: 'Assign / return / consume stock on the Teams tab (rows are created implicitly by upstream flows — no .create key)' },
          { key: 'custody.places.view', label: 'View Places Custody', description: 'See the Places tab on the Custody page (stock at customer sites)' },
          { key: 'custody.places.edit', label: 'Edit Places Custody', description: 'Assign / return / consume stock on the Places tab (rows are created implicitly by upstream flows — no .create key)' },
        ],
      },
      {
        id: 'ops-consumption',
        label: 'Consumption',
        icon: Flame,
        permissions: [
          { key: 'consumption.view',   label: 'View Consumption',   description: 'Access the consumption entries list and detail dialog' },
          { key: 'consumption.create', label: 'Create Consumption', description: 'Post new consumption entries (deducts stock + books COGS)' },
          { key: 'consumption.cancel', label: 'Cancel Consumption', description: 'Cancel a posted consumption or approve a cancellation request (acts as .edit for this surface)' },
        ],
      },
      {
        id: 'ops-damaged-stock',
        label: 'Damaged Stock',
        icon: AlertTriangle,
        permissions: [
          { key: 'damaged_stock.on_hand.view',        label: 'View On-hand Damaged', description: 'See the On-hand tab on the Damaged Stock page' },
          { key: 'damaged_stock.on_hand.edit',        label: 'Edit On-hand Damaged', description: 'Send-for-repair / write-off from the On-hand tab (rows are created by receival/return flows — no .create key)' },
          { key: 'damaged_stock.out_for_repair.view', label: 'View Out for Repair',  description: 'See the Out for Repair tab on the Damaged Stock page' },
          { key: 'damaged_stock.out_for_repair.edit', label: 'Edit Out for Repair',  description: 'Assign vendor / return from repair on the Out for Repair tab (no .create key)' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    permissions: [
      { key: 'reports.access', label: 'Access Reports Dropdown', description: 'Show the Reports dropdown in the top nav' },
    ],
    children: [
      {
        id: 'rpt-dashboard',
        label: 'Financial Dashboard',
        icon: LayoutDashboard,
        permissions: [
          { key: 'reports.view', label: 'View Reports', description: 'Access all report pages' },
          { key: 'reports.manage', label: 'Export Reports', description: 'Export report data to CSV or PDF (reports are read-only — .manage here means "can export")' },
          { key: 'reports.dashboard_finance', label: 'View Financial Dashboard', description: 'See Receivables, Payables, Cash In/Out, trend chart and overdue tables on the home dashboard' },
        ],
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings2,
    permissions: [
      { key: 'system.admin', label: 'Full System Access (Owner)', description: 'GRANTS EVERY PERMISSION — bypasses all access checks. Toggle this on for Owner-level roles instead of ticking every box individually. Use sparingly.' },
      { key: 'system.import', label: 'Import Data', description: 'Access the CSV import tool for bulk data upload' },
      { key: 'system.export', label: 'Export Data', description: 'Export data to CSV or PDF formats' },
    ],
  },
]

export function countPerms(node: TreeNode): number {
  let c = node.permissions?.length ?? 0
  for (const child of node.children ?? []) c += countPerms(child)
  return c
}

function collectAllIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>()
  function walk(n: TreeNode) {
    if ((n.children?.length ?? 0) > 0 || (n.permissions?.length ?? 0) > 0) ids.add(n.id)
    for (const c of n.children ?? []) walk(c)
  }
  for (const n of nodes) walk(n)
  return ids
}

function nodeHasMatch(node: TreeNode, search: string): boolean {
  if (!search) return true
  const s = search.toLowerCase()
  if (node.label.toLowerCase().includes(s)) return true
  if (node.permissions?.some(p => p.label.toLowerCase().includes(s) || p.key.toLowerCase().includes(s))) return true
  return node.children?.some(c => nodeHasMatch(c, s)) ?? false
}

function TreeNodeRow({
  node,
  depth,
  expandedIds,
  onToggle,
  search,
}: {
  node: TreeNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  search: string
}) {
  const filteredPerms = useMemo(() => {
    if (!search) return node.permissions ?? []
    const s = search.toLowerCase()
    return (node.permissions ?? []).filter(
      p => p.label.toLowerCase().includes(s) || p.key.toLowerCase().includes(s),
    )
  }, [node.permissions, search])

  if (search && !nodeHasMatch(node, search)) return null

  const isExpanded = expandedIds.has(node.id)
  const hasChildren = (node.children?.length ?? 0) > 0
  const hasPerms = (node.permissions?.length ?? 0) > 0
  const isExpandable = hasChildren || hasPerms
  const total = countPerms(node)
  const Icon = node.icon

  const showExpanded = isExpanded || !!search

  const depthBg =
    depth === 0 ? '' : depth === 1 ? 'bg-muted/20' : depth === 2 ? 'bg-muted/35' : 'bg-muted/50'

  return (
    <>
      <button
        type="button"
        className={`w-full flex items-center gap-2 py-2.5 hover:bg-accent/50 text-left transition-colors ${depthBg}`}
        style={{ paddingLeft: `${16 + depth * 20}px`, paddingRight: 16 }}
        onClick={() => isExpandable && onToggle(node.id)}
      >
        {isExpandable ? (
          showExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
        <span
          className={
            depth === 0
              ? 'text-sm font-semibold flex-1'
              : node.isGroupHeader
                ? 'text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex-1'
                : 'text-sm font-medium flex-1'
          }
        >
          {node.label}
        </span>
        <Badge variant="outline" className="text-[10px] tabular-nums h-5 px-1.5 shrink-0">
          {total}
        </Badge>
      </button>

      {showExpanded && (
        <>
          {filteredPerms.map(perm => (
            <div
              key={perm.key}
              className={`flex items-start gap-3 py-2 ${depthBg}`}
              style={{
                paddingLeft: `${36 + depth * 20}px`,
                paddingRight: 16,
              }}
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-primary block">{perm.label}</span>
                <span className="text-xs text-muted-foreground">{perm.description}</span>
              </div>
              <code className="text-[10px] text-muted-foreground font-mono shrink-0 hidden sm:block">
                {perm.key}
              </code>
            </div>
          ))}

          {node.children?.map(child => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              search={search}
            />
          ))}
        </>
      )}
    </>
  )
}

export function collectPermKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = []
  function walk(n: TreeNode) {
    for (const p of n.permissions ?? []) keys.push(p.key)
    for (const c of n.children ?? []) walk(c)
  }
  for (const n of nodes) walk(n)
  return keys
}

export const TOTAL_TREE_PERMISSIONS = NAV_TREE.reduce((n, node) => n + countPerms(node), 0)

export function PermissionTree({ search }: { search: string }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allIds = useMemo(() => collectAllIds(NAV_TREE), [])

  const expandAll = useCallback(() => setExpandedIds(new Set(allIds)), [allIds])
  const collapseAll = useCallback(() => setExpandedIds(new Set()), [])

  const moduleCount = NAV_TREE.length

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {TOTAL_TREE_PERMISSIONS} permissions across {moduleCount} sections.
          Permissions are assigned to roles, not directly to users.
        </p>
        <div className="flex gap-3 shrink-0">
          <button type="button" className="text-xs text-primary hover:underline min-h-11 md:min-h-0" onClick={expandAll}>
            Expand All
          </button>
          <button type="button" className="text-xs text-primary hover:underline min-h-11 md:min-h-0" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      <div className="border rounded-md divide-y divide-border overflow-hidden">
        {NAV_TREE.map(node => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            onToggle={toggle}
            search={search}
          />
        ))}
      </div>
    </div>
  )
}

export function validatePermissionSet(perms: string[]): { valid: boolean; orphans: string[] } {
  const orphans: string[] = []
  const set = new Set(perms)
  if (set.has('system.admin')) return { valid: true, orphans: [] }
  for (const p of perms) {
    if (p.endsWith('.create') || p.endsWith('.edit') || p.endsWith('.manage')) {
      const area = p.replace(/\.(create|edit|manage)$/, '')
      const viewKey = `${area}.view`
      if (!set.has(viewKey)) orphans.push(p)
    }
  }
  return { valid: orphans.length === 0, orphans }
}
