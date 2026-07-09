import React from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Database, ShoppingCart, ClipboardList,
  FileText, Receipt, Users, Settings2, Headphones,
  BarChart2, Package,
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

export type PermissionSection = {
  /** Sub-header label rendered above the section's permissions. */
  label: string
  permissions: PermissionEntry[]
}

export type PermissionGroup = {
  module: string
  icon: IconFC
  /** Flat permissions list, rendered before any `sections`. */
  permissions: PermissionEntry[]
  /** Optional sub-sections rendered under their own sub-headers. */
  sections?: PermissionSection[]
}

/** Collect every permission key in a group — including those nested in sections. */
export function groupKeys(group: PermissionGroup): string[] {
  return [
    ...group.permissions.map((p) => p.key),
    ...(group.sections ?? []).flatMap((s) => s.permissions.map((p) => p.key)),
  ]
}

/** Walk every PermissionEntry in a group, flat first then per-section. */
export function groupEntries(group: PermissionGroup): PermissionEntry[] {
  return [
    ...group.permissions,
    ...(group.sections ?? []).flatMap((s) => s.permissions),
  ]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: 'Master Data',
    icon: asFC(Database),
    permissions: [
      { key: 'master_data.access', label: 'Access Master Data', description: 'Show the Master Data dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Companies & Divisions',
        permissions: [
          { key: 'master_data.companies.view',   label: 'View Companies',   description: 'Access the companies list and details' },
          { key: 'master_data.companies.manage', label: 'Manage Companies', description: 'Create, edit, and delete company records' },
          { key: 'master_data.divisions.view',   label: 'View Divisions',   description: 'Access the divisions list and details' },
          { key: 'master_data.divisions.manage', label: 'Manage Divisions', description: 'Create, edit, and delete division records' },
        ],
      },
      {
        label: 'Warehouses (Master Data)',
        permissions: [
          { key: 'master_data.warehouses.view',   label: 'View Warehouses',   description: 'Access the warehouses list and details' },
          { key: 'master_data.warehouses.manage', label: 'Manage Warehouses', description: 'Create, edit, and delete warehouse records' },
        ],
      },
      {
        label: 'Inventory',
        permissions: [
          { key: 'master_data.inventory.view',   label: 'View Inventory',   description: 'Browse inventory items, categories, and brand variants' },
          { key: 'master_data.inventory.manage', label: 'Manage Inventory', description: 'Create, edit, and delete inventory items and variants' },
        ],
      },
      {
        label: 'Suppliers',
        permissions: [
          { key: 'master_data.suppliers.view',   label: 'View Suppliers',   description: 'Access the suppliers list and contact details' },
          { key: 'master_data.suppliers.manage', label: 'Manage Suppliers', description: 'Create, edit, and delete supplier records' },
        ],
      },
      {
        label: 'Customers',
        permissions: [
          { key: 'master_data.customers.view',                label: 'View Customers',           description: 'Access the customers list and details' },
          { key: 'master_data.customers.manage',              label: 'Manage Customers',         description: 'Create, edit, and delete customer records' },
          { key: 'master_data.customers.change_credit_group', label: 'Change Credit Group',      description: 'Move a customer between credit groups (typically Accounting Manager / Owner)' },
          { key: 'master_data.customers.change_type',         label: 'Change Customer Type',     description: 'Switch Cash ↔ Credit or Individual ↔ Business (financial classification — requires updated docs)' },
        ],
      },
      {
        label: 'Service Customers',
        permissions: [
          { key: 'master_data.service_customers.view',   label: 'View Service Customers',   description: 'Access the service customers list and details' },
          { key: 'master_data.service_customers.manage', label: 'Manage Service Customers', description: 'Create, edit, and delete service customer records' },
        ],
      },
      {
        label: 'Services',
        permissions: [
          { key: 'master_data.services.view',    label: 'View Services',           description: 'Access the services catalog and pricing' },
          { key: 'master_data.services.manage',  label: 'Manage Services',         description: 'Create, edit, and delete service definitions' },
          { key: 'master_data.services.approve', label: 'Approve Service Changes', description: 'Review and approve/reject service change requests' },
        ],
      },
      {
        label: 'Subscription Packages',
        permissions: [
          { key: 'master_data.subscriptions.view',   label: 'View Subscriptions',   description: 'Access subscription packages list and details' },
          { key: 'master_data.subscriptions.manage', label: 'Manage Subscriptions', description: 'Create, edit, and delete subscription packages' },
        ],
      },
      {
        label: 'Users & Roles',
        permissions: [
          { key: 'master_data.users.view',   label: 'View Users',   description: 'Access the users list and profile details' },
          { key: 'master_data.users.manage', label: 'Manage Users', description: 'Create, edit, deactivate, and reset passwords for users' },
          { key: 'master_data.roles.view',   label: 'View Roles',   description: 'Access the roles list and permission assignments' },
          { key: 'master_data.roles.manage', label: 'Manage Roles', description: 'Create, edit, and delete custom roles' },
        ],
      },
      {
        label: 'Audit Trail',
        permissions: [
          { key: 'master_data.audit.view', label: 'View Audit Trail', description: 'Access the activity log and audit history' },
        ],
      },
      {
        label: 'Admin Settings',
        permissions: [
          { key: 'master_data.admin.view',   label: 'View Admin Settings',   description: 'Access the admin settings panel' },
          { key: 'master_data.admin.manage', label: 'Manage Admin Settings', description: 'Edit admin settings including brand groups and reason lists' },
        ],
      },
    ],
  },
  {
    module: 'Purchase & Sales',
    icon: asFC(ShoppingCart),
    permissions: [
      { key: 'purchase_sales.access', label: 'Access Purchase & Sales', description: 'Show the Purchase & Sales dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Purchase Orders',
        permissions: [
          { key: 'purchase.orders.view',   label: 'View Purchase Orders',   description: 'View all purchase orders and their details' },
          { key: 'purchase.orders.manage', label: 'Manage Purchase Orders', description: 'Create, edit, and manage purchase order details and line items' },
        ],
      },
      {
        label: 'Purchase Approvals',
        permissions: [
          { key: 'purchase.approvals.view',         label: 'View Approvals Queue',   description: 'Access the purchase order approvals queue' },
          { key: 'purchase.approvals.chain.manage', label: 'Manage Approval Chains', description: 'Configure approval chains, tiers, and role assignments' },
          { key: 'purchase.approvals.bypass',       label: 'Bypass Approvals',       description: 'Force-approve stuck purchase order approval steps' },
        ],
      },
      {
        label: 'Shipments',
        permissions: [
          { key: 'purchase.shipments.view',   label: 'View Shipments',   description: 'Track shipment status and events' },
          { key: 'purchase.shipments.manage', label: 'Manage Shipments', description: 'Create shipments and update their tracking events' },
        ],
      },
      {
        label: 'Receivals',
        permissions: [
          { key: 'purchase.receivals.view',   label: 'View Receivals',   description: 'Access receival records and goods inward' },
          { key: 'purchase.receivals.manage', label: 'Manage Receivals', description: 'Create and process goods receivals' },
        ],
      },
      {
        label: 'Landed Costs',
        permissions: [
          { key: 'purchase.landed_costs.view',   label: 'View Landed Costs',   description: 'View landed cost records and allocations' },
          { key: 'purchase.landed_costs.manage', label: 'Manage Landed Costs', description: 'Create and void landed cost records' },
        ],
      },
      {
        label: 'Bills',
        permissions: [
          { key: 'purchase.bills.view',   label: 'View Bills',   description: 'Access purchase bills and bill details' },
          { key: 'purchase.bills.manage', label: 'Manage Bills', description: 'Create and edit purchase bills' },
        ],
      },
      {
        label: 'RFQ',
        permissions: [
          { key: 'purchase.rfq.view',   label: 'View RFQs',   description: 'Access request for quotation records' },
          { key: 'purchase.rfq.manage', label: 'Manage RFQs', description: 'Create and manage requests for quotations' },
        ],
      },
      {
        label: 'Dead Stock Report',
        permissions: [
          { key: 'purchase.dead_stock.view', label: 'View Dead Stock Report', description: 'Access the dead stock and slow-moving inventory report' },
        ],
      },
      {
        label: 'Purchase Returns',
        permissions: [
          { key: 'purchase.returns.view',   label: 'View Purchase Returns',   description: 'Access purchase return records' },
          { key: 'purchase.returns.manage', label: 'Manage Purchase Returns', description: 'Create and process purchase return requests' },
        ],
      },
      {
        label: 'Debit Notes',
        permissions: [
          { key: 'purchase.debit_notes.view', label: 'View Debit Notes', description: 'Access the purchase debit notes page' },
        ],
      },
      {
        label: 'Supplier Payments',
        permissions: [
          { key: 'purchase.payments.view',   label: 'View Purchase Payments',   description: 'Access purchase payment records' },
          { key: 'purchase.payments.manage', label: 'Manage Purchase Payments', description: 'Create and manage purchase payment transactions' },
        ],
      },
      {
        label: 'Warehouse Operations (legacy alias)',
        permissions: [
          { key: 'purchase.warehouses.view',   label: 'View Warehouse Operations',   description: 'Access stock levels, movements, and transfers' },
          { key: 'purchase.warehouses.manage', label: 'Manage Warehouse Operations', description: 'Create transfers, adjustments, and inventory checks' },
        ],
      },
      {
        label: 'Sale Orders',
        permissions: [
          { key: 'sales.orders.view',   label: 'View Sale Orders',   description: 'View all sale orders and quotations' },
          { key: 'sales.orders.manage', label: 'Manage Sale Orders', description: 'Create, edit, and manage sale order details' },
        ],
      },
      {
        label: 'Sales Approvals',
        permissions: [
          { key: 'sales.approvals.view',   label: 'View Sales Approvals',   description: 'Access the sales approvals queue (margin + credit)' },
          { key: 'sales.approvals.manage', label: 'Act on Sales Approvals', description: 'Approve or reject sales approval slips (requires sales_margin or sales_credit scope on a role to actually act)' },
        ],
      },
      {
        label: 'Sales Invoices',
        permissions: [
          { key: 'sales.invoices.view',   label: 'View Sales Invoices',   description: 'Access sales invoice records' },
          { key: 'sales.invoices.manage', label: 'Manage Sales Invoices', description: 'Create and manage sales invoices' },
        ],
      },
      {
        label: 'Sale Returns',
        permissions: [
          { key: 'sales.returns.view',   label: 'View Sale Returns',   description: 'Access sale return records' },
          { key: 'sales.returns.manage', label: 'Manage Sale Returns', description: 'Create and process sale return requests' },
        ],
      },
      {
        label: 'Deliveries',
        permissions: [
          { key: 'sales.deliveries.view',   label: 'View Deliveries',   description: 'Access delivery records and tracking' },
          { key: 'sales.deliveries.manage', label: 'Manage Deliveries', description: 'Create and update delivery records' },
        ],
      },
      {
        label: 'Credit Notes',
        permissions: [
          { key: 'sales.credit_notes.view',   label: 'View Credit Notes',   description: 'Access credit and debit note records' },
          { key: 'sales.credit_notes.manage', label: 'Manage Credit Notes', description: 'Create and process credit and debit notes' },
        ],
      },
    ],
  },
  {
    module: 'Warehouse',
    icon: asFC(Package),
    permissions: [
      { key: 'warehouse.access', label: 'Access Warehouse Module', description: 'Show the Warehouse link in Master Data and grant access to the warehouse page' },
    ],
    sections: [
      {
        label: 'Warehouses Tab',
        permissions: [
          { key: 'warehouse.warehouses.view', label: 'View Warehouses Tab',  description: 'See the Warehouses tab listing physical warehouses' },
          { key: 'warehouse.settings.manage', label: 'Manage WH Settings',   description: 'Edit warehouses, assign Warehouse RPs, configure reorder points' },
        ],
      },
      {
        label: 'Stock Overview Tab',
        permissions: [
          { key: 'warehouse.stock.view', label: 'View Stock Overview', description: 'See stock levels per warehouse and item' },
        ],
      },
      {
        label: 'Transfers Tab',
        permissions: [
          { key: 'warehouse.transfers.view',    label: 'View Transfers',     description: 'See the Transfers tab and transfer history' },
          { key: 'warehouse.transfer.create',   label: 'Create Transfers',   description: 'Initiate stock transfers between warehouses' },
          { key: 'warehouse.transfer.dispatch', label: 'Dispatch Transfers', description: 'Approve items leaving a warehouse (Warehouse RP only)' },
          { key: 'warehouse.transfer.receive',  label: 'Receive Transfers',  description: 'Confirm items arriving at a warehouse (Warehouse RP only)' },
          { key: 'warehouse.transfer.approve',  label: 'Override Transfers', description: 'Override/approve any transfer step (Inventory Manager)' },
        ],
      },
      {
        label: 'Adjustments Tab',
        permissions: [
          { key: 'warehouse.adjustments.view',   label: 'View Adjustments',    description: 'See the Adjustments tab and history' },
          { key: 'warehouse.adjustment.request', label: 'Request Adjustments', description: 'Submit stock adjustment requests' },
        ],
      },
      {
        label: 'Inv. Checks Tab',
        permissions: [
          { key: 'warehouse.checks.view',  label: 'View Inv. Checks',   description: 'See the Inv. Checks tab and history' },
          { key: 'warehouse.check.count',  label: 'Count Inventory',    description: 'Participate in inventory count checks' },
          { key: 'warehouse.check.create', label: 'Create Inv. Checks', description: 'Create and assign inventory check sessions' },
        ],
      },
      {
        label: 'Stock Value Tab',
        permissions: [
          { key: 'warehouse.stock_value.view', label: 'View Stock Value', description: 'See financial stock valuation per warehouse' },
        ],
      },
      {
        label: 'Movements Tab',
        permissions: [
          { key: 'warehouse.movements.view', label: 'View Movements', description: 'See the stock movement audit log' },
        ],
      },
      {
        label: 'Receivals & Deliveries Tab',
        permissions: [
          { key: 'warehouse.receivals.view', label: 'View Receivals & Deliveries', description: 'See the receivals and deliveries summary' },
        ],
      },
    ],
  },
  {
    module: 'Orders',
    icon: asFC(ClipboardList),
    permissions: [
      { key: 'orders.access', label: 'Access Orders Dropdown', description: 'Show the Orders dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Orders',
        permissions: [
          { key: 'orders.view',   label: 'View Orders',   description: 'Access the orders list and details' },
          { key: 'orders.manage', label: 'Manage Orders', description: 'Create, edit, and assign service orders' },
        ],
      },
      {
        label: 'Follow-ups',
        permissions: [
          { key: 'follow_ups.request', label: 'Request Follow-up', description: 'Submit a follow-up request from the field after completing a job' },
          { key: 'follow_ups.confirm', label: 'Confirm Follow-up', description: 'Confirm or reject team-leader follow-up requests and schedule the follow-up order' },
        ],
      },
      {
        label: 'Quotations',
        permissions: [
          { key: 'quotations.view',   label: 'View Quotations',   description: 'Access the quotations list and details' },
          { key: 'quotations.manage', label: 'Manage Quotations', description: 'Create, edit, and manage quotation details' },
        ],
      },
    ],
  },
  {
    module: 'Contracts',
    icon: asFC(FileText),
    permissions: [
      { key: 'contracts.access', label: 'Access Contracts Dropdown', description: 'Show the Contracts dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Draft Quotations',
        permissions: [
          { key: 'contracts.quotations.view',   label: 'View Draft Quotations',   description: 'Access the contract quotations list and details' },
          { key: 'contracts.quotations.manage', label: 'Manage Draft Quotations', description: 'Create, edit, and manage contract quotations' },
        ],
      },
      {
        label: 'Live Contracts',
        permissions: [
          { key: 'contracts.live.view',   label: 'View Live Contracts',   description: 'Access the live contracts list and details' },
          { key: 'contracts.live.manage', label: 'Manage Live Contracts', description: 'Edit and manage active contract details' },
        ],
      },
      {
        label: 'Activation',
        permissions: [
          { key: 'contracts.activate', label: 'Activate / Manage Docs', description: 'Activate contracts and upload/delete contract documents (terms, signed PDFs)' },
        ],
      },
    ],
  },
  {
    module: 'Invoices & Payments',
    icon: asFC(Receipt),
    permissions: [
      { key: 'invoices.access', label: 'Access Invoices Dropdown', description: 'Show the Invoices dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Invoices',
        permissions: [
          { key: 'invoices.view',   label: 'View Invoices',   description: 'Access the invoices list and details' },
          { key: 'invoices.manage', label: 'Manage Invoices', description: 'Create, edit, and manage invoice details' },
        ],
      },
      {
        label: 'Payments',
        permissions: [
          { key: 'payments.view',   label: 'View Payments',   description: 'Access payment records' },
          { key: 'payments.manage', label: 'Manage Payments', description: 'Record and manage payment transactions' },
        ],
      },
    ],
  },
  {
    module: 'Teams',
    icon: asFC(Users),
    permissions: [
      { key: 'teams.access', label: 'Access Teams Dropdown', description: 'Show the Teams dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Teams & Employees',
        permissions: [
          { key: 'teams.view',       label: 'View Teams',       description: 'Access the teams list and details' },
          { key: 'teams.manage',     label: 'Manage Teams',     description: 'Create, edit, and delete teams' },
          { key: 'employees.view',   label: 'View Employees',   description: 'Access the employee directory' },
          { key: 'employees.manage', label: 'Manage Employees', description: 'Create, edit, and manage employee records' },
        ],
      },
      {
        label: 'Team Leader',
        permissions: [
          { key: 'teams.team_leader.view',   label: 'View Team Leader',   description: 'Access the Team Leader field execution page and monitor any team\'s visits' },
          { key: 'teams.team_leader.manage', label: 'Manage Team Leader', description: 'Manage team leader assignments and field execution actions' },
        ],
      },
      {
        label: 'Map',
        permissions: [
          { key: 'teams.map.view',   label: 'View Map',   description: 'Access the live vehicle tracking map' },
          { key: 'teams.map.manage', label: 'Manage Map', description: 'Manage vehicle assignments and map settings' },
        ],
      },
      {
        label: 'Calendar',
        permissions: [
          { key: 'calendar.view',   label: 'View Calendar',   description: 'Access the Operations Calendar page' },
          { key: 'calendar.manage', label: 'Manage Calendar', description: 'Edit visits and reassign teams from the calendar' },
        ],
      },
    ],
  },
  {
    module: 'Reports',
    icon: asFC(BarChart2),
    permissions: [
      { key: 'reports.access', label: 'Access Reports Dropdown', description: 'Show the Reports dropdown in the top nav' },
      { key: 'reports.view',   label: 'View Reports',            description: 'Access all report pages' },
      { key: 'reports.manage', label: 'Manage Reports',          description: 'Export report data to CSV or PDF' },
    ],
  },
  {
    module: 'System',
    icon: asFC(Settings2),
    permissions: [
      { key: 'system.admin',  label: 'Full System Access (Owner)', description: 'GRANTS EVERY PERMISSION — bypasses all access checks. Toggle this on for Owner-level roles instead of ticking every box individually. Use sparingly.' },
      { key: 'system.import', label: 'Import Data',                description: 'Access the CSV import tool for bulk data upload' },
      { key: 'system.export', label: 'Export Data',                description: 'Export data to CSV or PDF formats' },
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

const MODULE_KEY_MAP: Record<string, string> = {
  'Master Data':          'master_data',
  'Purchase & Sales':     'purchase_sales',
  'Warehouse':            'warehouse',
  'Orders':               'orders',
  'Contracts':            'contracts',
  'Invoices & Payments':  'finance',
  'Teams':                'teams',
  'Reports':              'reports',
  'System':               'system',
  'Contact Centre':       'contact_centre',
}

function getEnabledModules(): Set<string> | null {
  const raw = process.env.NEXT_PUBLIC_ENABLED_MODULES?.trim()
  if (!raw) return null
  return new Set(raw.split(',').map((s) => s.trim()))
}

const BRANCH_ENABLED_MODULES = new Set(['master_data', 'purchase_sales', 'warehouse'])

export const ACTIVE_PERMISSION_GROUPS: PermissionGroup[] = (() => {
  const enabled = getEnabledModules() ?? BRANCH_ENABLED_MODULES
  return PERMISSION_GROUPS.filter((g) => {
    const key = MODULE_KEY_MAP[g.module]
    return key ? enabled.has(key) : true
  })
})()

export const ALL_PERMISSIONS = ACTIVE_PERMISSION_GROUPS.flatMap(groupKeys)

export const ROLE_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'rose', 'amber', 'indigo'] as const
export type RoleColor = (typeof ROLE_COLORS)[number]

/** Deterministic color derived from role name — no DB column needed. */
export function roleColor(name: string): RoleColor {
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % ROLE_COLORS.length
  return ROLE_COLORS[i]
}
