import React from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Database, ShoppingCart, TrendingUp, ClipboardList,
  FileText, Receipt, Users, Settings2, CalendarDays, Headphones,
  BarChart2, Map, Package,
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
      { key: 'master_data.companies.view',           label: 'View Companies',           description: 'Access the companies list and details' },
      { key: 'master_data.companies.manage',          label: 'Manage Companies',         description: 'Create, edit, and delete company records' },
      { key: 'master_data.divisions.view',            label: 'View Divisions',           description: 'Access the divisions list and details' },
      { key: 'master_data.divisions.manage',          label: 'Manage Divisions',         description: 'Create, edit, and delete division records' },
      { key: 'master_data.warehouses.view',           label: 'View Warehouses',          description: 'Access the warehouses list and details' },
      { key: 'master_data.warehouses.manage',         label: 'Manage Warehouses',        description: 'Create, edit, and delete warehouse records' },
      { key: 'master_data.inventory.view',            label: 'View Inventory',           description: 'Browse inventory items, categories, and brand variants' },
      { key: 'master_data.inventory.manage',          label: 'Manage Inventory',         description: 'Create, edit, and delete inventory items and variants' },
      { key: 'master_data.suppliers.view',            label: 'View Suppliers',           description: 'Access the suppliers list and contact details' },
      { key: 'master_data.suppliers.manage',          label: 'Manage Suppliers',         description: 'Create, edit, and delete supplier records' },
      { key: 'master_data.customers.view',            label: 'View Customers',           description: 'Access the customers list and details' },
      { key: 'master_data.customers.manage',          label: 'Manage Customers',         description: 'Create, edit, and delete customer records' },
      { key: 'master_data.service_customers.view',    label: 'View Service Customers',   description: 'Access the service customers list and details' },
      { key: 'master_data.service_customers.manage',  label: 'Manage Service Customers', description: 'Create, edit, and delete service customer records' },
      { key: 'master_data.services.view',             label: 'View Services',            description: 'Access the services catalog and pricing' },
      { key: 'master_data.services.manage',           label: 'Manage Services',          description: 'Create, edit, and delete service definitions' },
      { key: 'master_data.services.approve',          label: 'Approve Service Changes',  description: 'Review and approve/reject service change requests' },
      { key: 'master_data.subscriptions.view',        label: 'View Subscriptions',       description: 'Access subscription packages list and details' },
      { key: 'master_data.subscriptions.manage',      label: 'Manage Subscriptions',     description: 'Create, edit, and delete subscription packages' },
      { key: 'master_data.users.view',                label: 'View Users',               description: 'Access the users list and profile details' },
      { key: 'master_data.users.manage',              label: 'Manage Users',             description: 'Create, edit, deactivate, and reset passwords for users' },
      { key: 'master_data.roles.view',                label: 'View Roles',               description: 'Access the roles list and permission assignments' },
      { key: 'master_data.roles.manage',              label: 'Manage Roles',             description: 'Create, edit, and delete custom roles' },
      { key: 'master_data.audit.view',                label: 'View Audit Trail',         description: 'Access the activity log and audit history' },
      { key: 'master_data.admin.view',                label: 'View Admin Settings',      description: 'Access the admin settings panel' },
      { key: 'master_data.admin.manage',              label: 'Manage Admin Settings',    description: 'Edit admin settings including brand groups and reason lists' },
    ],
  },
  {
    module: 'Purchase',
    icon: asFC(ShoppingCart),
    permissions: [
      { key: 'purchase.orders.view',            label: 'View Purchase Orders',        description: 'View all purchase orders and their details' },
      { key: 'purchase.orders.manage',          label: 'Manage Purchase Orders',      description: 'Create, edit, and manage purchase order details and line items' },
      { key: 'purchase.approvals.view',         label: 'View Approvals Queue',        description: 'Access the purchase order approvals queue' },
      { key: 'purchase.approvals.chain.manage', label: 'Manage Approval Chains',      description: 'Configure approval chains, tiers, and role assignments' },
      { key: 'purchase.approvals.bypass',       label: 'Bypass Approvals',            description: 'Force-approve stuck purchase order approval steps' },
      { key: 'purchase.shipments.view',         label: 'View Shipments',              description: 'Track shipment status and events' },
      { key: 'purchase.shipments.manage',       label: 'Manage Shipments',            description: 'Create shipments and update their tracking events' },
      { key: 'purchase.landed_costs.view',      label: 'View Landed Costs',           description: 'View landed cost records and allocations' },
      { key: 'purchase.landed_costs.manage',    label: 'Manage Landed Costs',         description: 'Create and void landed cost records' },
      { key: 'purchase.warehouses.view',        label: 'View Warehouse Operations',   description: 'Access stock levels, movements, and transfers' },
      { key: 'purchase.warehouses.manage',      label: 'Manage Warehouse Operations', description: 'Create transfers, adjustments, and inventory checks' },
      { key: 'purchase.returns.view',           label: 'View Purchase Returns',       description: 'Access purchase return records' },
      { key: 'purchase.returns.manage',         label: 'Manage Purchase Returns',     description: 'Create and process purchase return requests' },
      { key: 'purchase.receivals.view',         label: 'View Receivals',              description: 'Access receival records and goods inward' },
      { key: 'purchase.receivals.manage',       label: 'Manage Receivals',            description: 'Create and process goods receivals' },
      { key: 'purchase.payments.view',          label: 'View Purchase Payments',      description: 'Access purchase payment records' },
      { key: 'purchase.payments.manage',        label: 'Manage Purchase Payments',    description: 'Create and manage purchase payment transactions' },
      { key: 'purchase.dead_stock.view',        label: 'View Dead Stock Report',      description: 'Access the dead stock and slow-moving inventory report' },
      { key: 'purchase.bills.view',             label: 'View Bills',                  description: 'Access purchase bills and bill details' },
      { key: 'purchase.bills.manage',           label: 'Manage Bills',                description: 'Create and edit purchase bills' },
      { key: 'purchase.rfq.view',               label: 'View RFQs',                   description: 'Access request for quotation records' },
      { key: 'purchase.rfq.manage',             label: 'Manage RFQs',                 description: 'Create and manage requests for quotations' },
    ],
  },
  {
    module: 'Warehouse',
    icon: asFC(Package),
    permissions: [
      { key: 'warehouse.stock.view',           label: 'View Stock',              description: 'View stock levels, movements, and values across warehouses' },
      { key: 'warehouse.transfer.create',      label: 'Create Transfers',        description: 'Initiate stock transfers between warehouses' },
      { key: 'warehouse.transfer.dispatch',    label: 'Dispatch Transfers',      description: 'Approve items leaving a warehouse (Field RP only)' },
      { key: 'warehouse.transfer.receive',     label: 'Receive Transfers',       description: 'Confirm items arriving at a warehouse (Field RP only)' },
      { key: 'warehouse.transfer.approve',     label: 'Override Transfers',      description: 'Override/approve any transfer step (Inventory Manager)' },
      { key: 'warehouse.adjustment.request',   label: 'Request Adjustments',     description: 'Submit stock adjustment requests' },
      { key: 'warehouse.check.count',          label: 'Count Inventory',         description: 'Participate in inventory count checks' },
      { key: 'warehouse.check.create',         label: 'Create Inv. Checks',      description: 'Create and assign inventory check sessions' },
      { key: 'warehouse.settings.manage',      label: 'Manage WH Settings',      description: 'Edit warehouses, assign Field RPs, configure reorder points' },
    ],
  },
  {
    module: 'Sales',
    icon: asFC(TrendingUp),
    permissions: [
      { key: 'sales.orders.view',         label: 'View Sale Orders',       description: 'View all sale orders and quotations' },
      { key: 'sales.orders.manage',       label: 'Manage Sale Orders',     description: 'Create, edit, and manage sale order details' },
      { key: 'sales.invoices.view',       label: 'View Sales Invoices',    description: 'Access sales invoice records' },
      { key: 'sales.invoices.manage',     label: 'Manage Sales Invoices',  description: 'Create and manage sales invoices' },
      { key: 'sales.returns.view',        label: 'View Sale Returns',      description: 'Access sale return records' },
      { key: 'sales.returns.manage',      label: 'Manage Sale Returns',    description: 'Create and process sale return requests' },
      { key: 'sales.deliveries.view',     label: 'View Deliveries',        description: 'Access delivery records and tracking' },
      { key: 'sales.deliveries.manage',   label: 'Manage Deliveries',      description: 'Create and update delivery records' },
      { key: 'sales.credit_notes.view',   label: 'View Credit Notes',      description: 'Access credit and debit note records' },
      { key: 'sales.credit_notes.manage', label: 'Manage Credit Notes',    description: 'Create and process credit and debit notes' },
    ],
  },
  {
    module: 'Orders',
    icon: asFC(ClipboardList),
    permissions: [
      { key: 'orders.view',   label: 'View Orders',   description: 'Access the orders list and details' },
      { key: 'orders.manage', label: 'Manage Orders', description: 'Create, edit, and assign service orders' },
    ],
  },
  {
    module: 'Quotations',
    icon: asFC(FileText),
    permissions: [
      { key: 'quotations.view',   label: 'View Quotations',   description: 'Access the quotations list and details' },
      { key: 'quotations.manage', label: 'Manage Quotations', description: 'Create, edit, and manage quotation details' },
    ],
  },
  {
    module: 'Contracts',
    icon: asFC(FileText),
    permissions: [
      { key: 'contracts.quotations.view',   label: 'View Draft Quotations',   description: 'Access the contract quotations list and details' },
      { key: 'contracts.quotations.manage', label: 'Manage Draft Quotations', description: 'Create, edit, and manage contract quotations' },
      { key: 'contracts.live.view',         label: 'View Live Contracts',     description: 'Access the live contracts list and details' },
      { key: 'contracts.live.manage',       label: 'Manage Live Contracts',   description: 'Edit and manage active contract details' },
      { key: 'contracts.activate',          label: 'Activate / Manage Docs',  description: 'Activate contracts and upload/delete contract documents (terms, signed PDFs)' },
    ],
  },
  {
    module: 'Invoices & Payments',
    icon: asFC(Receipt),
    permissions: [
      { key: 'invoices.view',    label: 'View Invoices',    description: 'Access the invoices list and details' },
      { key: 'invoices.manage',  label: 'Manage Invoices',  description: 'Create, edit, and manage invoice details' },
      { key: 'payments.view',    label: 'View Payments',    description: 'Access payment records' },
      { key: 'payments.manage',  label: 'Manage Payments',  description: 'Record and manage payment transactions' },
    ],
  },
  {
    module: 'Teams',
    icon: asFC(Users),
    permissions: [
      { key: 'teams.view',               label: 'View Teams',         description: 'Access the teams list and details' },
      { key: 'teams.manage',             label: 'Manage Teams',       description: 'Create, edit, and delete teams' },
      { key: 'employees.view',           label: 'View Employees',     description: 'Access the employee directory' },
      { key: 'employees.manage',         label: 'Manage Employees',   description: 'Create, edit, and manage employee records' },
      { key: 'teams.team_leader.view',   label: 'View Team Leader',   description: 'Access the Team Leader field execution page and monitor any team\'s visits' },
      { key: 'teams.team_leader.manage', label: 'Manage Team Leader', description: 'Manage team leader assignments and field execution actions' },
      { key: 'teams.map.view',           label: 'View Map',           description: 'Access the live vehicle tracking map' },
      { key: 'teams.map.manage',         label: 'Manage Map',         description: 'Manage vehicle assignments and map settings' },
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
  {
    module: 'Calendar',
    icon: asFC(CalendarDays),
    permissions: [
      { key: 'calendar.view',   label: 'View Calendar',   description: 'Access the Operations Calendar page' },
      { key: 'calendar.manage', label: 'Manage Calendar', description: 'Edit visits and reassign teams from the calendar' },
    ],
  },
  {
    module: 'Reports',
    icon: asFC(BarChart2),
    permissions: [
      { key: 'reports.view',   label: 'View Reports',  description: 'Access all report pages' },
      { key: 'reports.manage', label: 'Manage Reports', description: 'Export report data to CSV or PDF' },
    ],
  },
  {
    module: 'Contact Centre',
    icon: asFC(Headphones),
    permissions: [
      {
        key: 'contact_centre.view',
        label: 'Access Contact Centre',
        description: 'View the Contact Centre sidebar, chat threads, and customer CRM panel',
      },
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
