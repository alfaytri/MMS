import React from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Database, ShoppingCart, TrendingUp, ClipboardList,
  FileText, Receipt, Users, Settings2,
} from 'lucide-react'

export type PermissionEntry = {
  key: string
  label: string
  description: string
}

// Wrap forwardRef icons in plain function components so typeof icon === 'function'
type IconFC = (props: LucideProps) => React.ReactElement | null

const asFC = (Icon: React.ElementType): IconFC =>
  (props: LucideProps) => React.createElement(Icon, props)

export type PermissionGroup = {
  module: string
  icon: IconFC
  permissions: PermissionEntry[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'Master Data',
    icon: asFC(Database),
    permissions: [
      { key: 'master_data.companies.view',   label: 'View Companies',        description: 'Access the companies list and details' },
      { key: 'master_data.companies.manage', label: 'Manage Companies',      description: 'Create, edit, and delete company records' },
      { key: 'master_data.divisions.view',   label: 'View Divisions',        description: 'Access the divisions list and details' },
      { key: 'master_data.divisions.manage', label: 'Manage Divisions',      description: 'Create, edit, and delete division records' },
      { key: 'master_data.warehouses.view',  label: 'View Warehouses',       description: 'Access the warehouses list and details' },
      { key: 'master_data.warehouses.manage',label: 'Manage Warehouses',     description: 'Create, edit, and delete warehouse records' },
      { key: 'master_data.inventory.view',   label: 'View Inventory',        description: 'Browse inventory items, categories, and brand variants' },
      { key: 'master_data.inventory.manage', label: 'Manage Inventory',      description: 'Create, edit, and delete inventory items and variants' },
      { key: 'master_data.suppliers.view',   label: 'View Suppliers',        description: 'Access the suppliers list and contact details' },
      { key: 'master_data.suppliers.manage', label: 'Manage Suppliers',      description: 'Create, edit, and delete supplier records' },
      { key: 'master_data.users.view',       label: 'View Users',            description: 'Access the users list and profile details' },
      { key: 'master_data.users.manage',     label: 'Manage Users',          description: 'Create, edit, deactivate, and reset passwords for users' },
      { key: 'master_data.roles.view',       label: 'View Roles',            description: 'Access the roles list and permission assignments' },
      { key: 'master_data.roles.manage',     label: 'Manage Roles',          description: 'Create, edit, and delete custom roles' },
      { key: 'master_data.audit.view',       label: 'View Audit Trail',      description: 'Access the activity log and audit history' },
      { key: 'master_data.admin.view',       label: 'View Admin Settings',   description: 'Access the admin settings panel' },
      { key: 'master_data.admin.manage',     label: 'Manage Admin Settings', description: 'Edit admin settings including brand groups and reason lists' },
    ],
  },
  {
    module: 'Purchase',
    icon: asFC(ShoppingCart),
    permissions: [
      { key: 'purchase.orders.view',          label: 'View Purchase Orders',       description: 'View all purchase orders and their details' },
      { key: 'purchase.orders.create',        label: 'Create Purchase Orders',     description: 'Create new purchase orders and save drafts' },
      { key: 'purchase.orders.edit',          label: 'Edit Purchase Orders',       description: 'Edit existing purchase order details and line items' },
      { key: 'purchase.approvals.view',       label: 'View Approvals Queue',       description: 'Access the purchase order approvals queue' },
      { key: 'purchase.approvals.manage',     label: 'Approve / Reject Orders',    description: 'Approve or reject pending purchase orders' },
      { key: 'purchase.approvals.chain.manage', label: 'Manage Approval Chains', description: 'Configure approval chains, tiers, and role assignments' },
      { key: 'purchase.approvals.bypass',       label: 'Bypass Approvals',        description: 'Force-approve stuck purchase order approval steps' },
      { key: 'purchase.shipments.view',       label: 'View Shipments',             description: 'Track shipment status and events' },
      { key: 'purchase.shipments.manage',     label: 'Manage Shipments',           description: 'Create shipments and update their tracking events' },
      { key: 'purchase.landed_costs.view',    label: 'View Landed Costs',          description: 'View landed cost records and allocations' },
      { key: 'purchase.landed_costs.manage',  label: 'Manage Landed Costs',        description: 'Create and void landed cost records' },
      { key: 'purchase.warehouses.view',      label: 'View Warehouse Operations',  description: 'Access stock levels, movements, and transfers' },
      { key: 'purchase.warehouses.manage',    label: 'Manage Warehouse Operations',description: 'Create transfers, adjustments, and inventory checks' },
      { key: 'purchase.returns.view',         label: 'View Purchase Returns',      description: 'Access purchase return records' },
      { key: 'purchase.returns.manage',       label: 'Manage Purchase Returns',    description: 'Create and process purchase return requests' },
      { key: 'purchase.dead_stock.view',      label: 'View Dead Stock Report',     description: 'Access the dead stock and slow-moving inventory report' },
    ],
  },
  {
    module: 'Sales',
    icon: asFC(TrendingUp),
    permissions: [
      { key: 'sales.orders.view',    label: 'View Sale Orders',    description: 'View all sale orders and quotations' },
      { key: 'sales.orders.create',  label: 'Create Sale Orders',  description: 'Create new sale orders and quotations' },
      { key: 'sales.orders.edit',    label: 'Edit Sale Orders',    description: 'Edit existing sale order details' },
      { key: 'sales.returns.view',   label: 'View Sale Returns',   description: 'Access sale return records' },
      { key: 'sales.returns.manage', label: 'Manage Sale Returns', description: 'Create and process sale return requests' },
    ],
  },
  {
    module: 'Orders',
    icon: asFC(ClipboardList),
    permissions: [
      { key: 'orders.view',   label: 'View Orders',   description: 'Access the orders list and details' },
      { key: 'orders.create', label: 'Create Orders', description: 'Create new service orders' },
      { key: 'orders.edit',   label: 'Edit Orders',   description: 'Edit existing order details' },
      { key: 'orders.assign', label: 'Assign Orders', description: 'Assign orders to teams and employees' },
    ],
  },
  {
    module: 'Contracts',
    icon: asFC(FileText),
    permissions: [
      { key: 'contracts.view',   label: 'View Contracts',   description: 'Access the contracts list and details' },
      { key: 'contracts.create', label: 'Create Contracts', description: 'Create new service contracts' },
      { key: 'contracts.edit',   label: 'Edit Contracts',   description: 'Edit existing contract details' },
    ],
  },
  {
    module: 'Invoices & Payments',
    icon: asFC(Receipt),
    permissions: [
      { key: 'invoices.view',    label: 'View Invoices',    description: 'Access the invoices list and details' },
      { key: 'invoices.create',  label: 'Create Invoices',  description: 'Generate new invoices' },
      { key: 'invoices.edit',    label: 'Edit Invoices',    description: 'Edit invoice details' },
      { key: 'payments.view',    label: 'View Payments',    description: 'Access payment records' },
      { key: 'payments.manage',  label: 'Manage Payments',  description: 'Record and manage payment transactions' },
    ],
  },
  {
    module: 'Teams',
    icon: asFC(Users),
    permissions: [
      { key: 'teams.view',      label: 'View Teams',      description: 'Access the teams list and details' },
      { key: 'teams.manage',    label: 'Manage Teams',    description: 'Create, edit, and delete teams' },
      { key: 'employees.view',  label: 'View Employees',  description: 'Access the employee directory' },
      { key: 'employees.manage',label: 'Manage Employees',description: 'Create, edit, and manage employee records' },
    ],
  },
  {
    module: 'System',
    icon: asFC(Settings2),
    permissions: [
      { key: 'system.admin',  label: 'System Administrator', description: 'Full system access including all admin functions' },
      { key: 'system.import', label: 'Import Data',          description: 'Access the CSV import tool for bulk data upload' },
      { key: 'system.export', label: 'Export Data',          description: 'Export data to CSV or PDF formats' },
    ],
  },
]

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))

export const ROLE_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'rose', 'amber', 'indigo'] as const
export type RoleColor = (typeof ROLE_COLORS)[number]

/** Deterministic color derived from role name — no DB column needed. */
export function roleColor(name: string): RoleColor {
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % ROLE_COLORS.length
  return ROLE_COLORS[i]
}
