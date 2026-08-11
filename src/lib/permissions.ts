import React from 'react'
import type { LucideProps } from 'lucide-react'
import {
  Database, ShoppingCart, ClipboardList,
  FileText, Receipt, Users, Settings2, Headphones,
  BarChart2, Package, Flame,
} from 'lucide-react'

export type PermissionEntry = {
  key: string
  label: string
  description: string
}

// Wrap forwardRef icons in plain function components so typeof icon === 'function'
type IconFC = (props: LucideProps) => React.ReactElement | null

const asFC = (Icon: React.ElementType): IconFC => {
  const WrappedIcon = (props: LucideProps) => React.createElement(Icon, props)
  WrappedIcon.displayName = (Icon as { displayName?: string }).displayName ?? 'Icon'
  return WrappedIcon
}

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

// ─────────────────────────────────────────────────────────────────────────────
// 3-state permission model (2026-08-04)
//
// Every mutating surface exposes a view/create/edit trio:
//   .view   — read-only access (see page, list, detail)
//   .create — add new records (New-X buttons, bulk import)
//   .edit   — modify existing records (update, cancel, void, delete, archive)
//
// Legacy .manage keys are RETAINED as an alias of .edit (no rename needed on
// existing role data). `useHasEditPermission` treats .manage === .edit.
// A one-shot backfill migration grants .create to every role currently
// holding .manage so existing workflows don't break on deploy.
//
// Some surfaces stay view-only (reports, audit trail) or expose bespoke
// action keys instead of the trio (transfers, adjustments, follow-ups,
// approvals, activation) — those are noted inline.
// ─────────────────────────────────────────────────────────────────────────────

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
          { key: 'master_data.companies.create', label: 'Create Companies', description: 'Add new company records' },
          { key: 'master_data.companies.manage', label: 'Edit Companies',   description: 'Edit and delete existing company records (legacy .manage — alias of .edit)' },
          { key: 'master_data.divisions.view',   label: 'View Divisions',   description: 'Access the divisions list and details' },
          { key: 'master_data.divisions.create', label: 'Create Divisions', description: 'Add new division records' },
          { key: 'master_data.divisions.manage', label: 'Edit Divisions',   description: 'Edit and delete existing division records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Warehouses (Master Data)',
        permissions: [
          { key: 'master_data.warehouses.view',   label: 'View Warehouses',   description: 'Access the warehouses list and details' },
          { key: 'master_data.warehouses.create', label: 'Create Warehouses', description: 'Add new warehouse records' },
          { key: 'master_data.warehouses.manage', label: 'Edit Warehouses',   description: 'Edit and delete existing warehouse records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Inventory',
        permissions: [
          { key: 'inventory.catalog.view',   label: 'View Inventory',   description: 'Open the Inventory page; view categories, items, brands, and origins' },
          { key: 'inventory.catalog.manage', label: 'Manage Inventory', description: 'Create, edit, archive, and delete categories, sub-levels, items, brands, and origins' },
        ],
      },
      {
        label: 'Inventory Pricing',
        permissions: [
          { key: 'inventory.pricing.view',   label: 'View Inventory Pricing',   description: 'View cost and selling prices on variants' },
          { key: 'inventory.pricing.manage', label: 'Manage Inventory Pricing', description: 'Change cost/selling price on variants (kept behind Accounting)' },
        ],
      },
      {
        label: 'Category Attributes',
        permissions: [
          { key: 'master_data.inventory.attributes.view',   label: 'View Category Attributes',   description: 'See the Attributes tab on the Inventory master-data page' },
          { key: 'master_data.inventory.attributes.manage', label: 'Manage Category Attributes', description: 'Create, edit, archive, and delete attribute definitions and options' },
        ],
      },
      {
        label: 'Suppliers',
        permissions: [
          { key: 'master_data.suppliers.view',   label: 'View Suppliers',   description: 'Access the suppliers list and contact details' },
          { key: 'master_data.suppliers.create', label: 'Create Suppliers', description: 'Add new supplier records' },
          { key: 'master_data.suppliers.manage', label: 'Edit Suppliers',   description: 'Edit and delete existing supplier records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Customers',
        permissions: [
          { key: 'master_data.customers.view',                label: 'View Customers',           description: 'Access the customers list and details' },
          { key: 'master_data.customers.create',              label: 'Create Customers',         description: 'Add new customer records' },
          { key: 'master_data.customers.manage',              label: 'Edit Customers',           description: 'Edit and delete existing customer records (legacy .manage — alias of .edit)' },
          { key: 'master_data.customers.change_credit_group', label: 'Change Credit Group',      description: 'Move a customer between credit groups (typically Accounting Manager / Owner)' },
          { key: 'master_data.customers.change_type',         label: 'Change Customer Type',     description: 'Switch Cash ↔ Credit or Individual ↔ Business (financial classification — requires updated docs)' },
        ],
      },
      {
        label: 'Service Customers',
        permissions: [
          { key: 'master_data.service_customers.view',   label: 'View Service Customers',   description: 'Access the service customers list and details' },
          { key: 'master_data.service_customers.create', label: 'Create Service Customers', description: 'Add new service customer records' },
          { key: 'master_data.service_customers.manage', label: 'Edit Service Customers',   description: 'Edit and delete existing service customer records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Services',
        permissions: [
          { key: 'master_data.services.view',    label: 'View Services',           description: 'Access the services catalog and pricing' },
          { key: 'master_data.services.create',  label: 'Create Services',         description: 'Add new service definitions' },
          { key: 'master_data.services.manage',  label: 'Edit Services',           description: 'Edit and delete existing service definitions (legacy .manage — alias of .edit)' },
          { key: 'master_data.services.approve', label: 'Approve Service Changes', description: 'Review and approve/reject service change requests' },
        ],
      },
      {
        label: 'Users & Roles',
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
        label: 'Audit Trail',
        permissions: [
          { key: 'master_data.audit.view', label: 'View Audit Trail', description: 'Access the activity log and audit history' },
        ],
      },
      {
        label: 'Admin Settings',
        permissions: [
          { key: 'master_data.admin.view',   label: 'View Admin Settings',   description: 'Access the admin settings panel' },
          { key: 'master_data.admin.manage', label: 'Edit Admin Settings',   description: 'Edit admin settings including brand groups and reason lists (legacy .manage — alias of .edit)' },
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
          { key: 'purchase.orders.create', label: 'Create Purchase Orders', description: 'Draft new purchase orders' },
          { key: 'purchase.orders.manage', label: 'Edit Purchase Orders',   description: 'Edit line items, cancel, and manage existing purchase orders (legacy .manage — alias of .edit)' },
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
          { key: 'purchase.shipments.create', label: 'Create Shipments', description: 'Create new shipments' },
          { key: 'purchase.shipments.manage', label: 'Edit Shipments',   description: 'Update tracking events and edit existing shipments (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Receivals',
        permissions: [
          { key: 'purchase.receivals.view',   label: 'View Receivals',   description: 'Access receival records and goods inward' },
          { key: 'purchase.receivals.create', label: 'Create Receivals', description: 'Create new goods receivals' },
          { key: 'purchase.receivals.manage', label: 'Edit Receivals',   description: 'Edit and process existing receivals (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Landed Costs',
        permissions: [
          { key: 'purchase.landed_costs.view',   label: 'View Landed Costs',   description: 'View landed cost records and allocations' },
          { key: 'purchase.landed_costs.create', label: 'Create Landed Costs', description: 'Create new landed cost records' },
          { key: 'purchase.landed_costs.manage', label: 'Edit Landed Costs',   description: 'Edit and void existing landed cost records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Bills',
        permissions: [
          { key: 'purchase.bills.view',   label: 'View Bills',   description: 'Access purchase bills and bill details' },
          { key: 'purchase.bills.create', label: 'Create Bills', description: 'Create new purchase bills' },
          { key: 'purchase.bills.manage', label: 'Edit Bills',   description: 'Edit existing purchase bills (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Supplier Payments',
        permissions: [
          { key: 'purchase.payments.view',   label: 'View Supplier Payments',   description: 'Access supplier payment records' },
          { key: 'purchase.payments.manage', label: 'Edit / Delete Supplier Payments', description: 'Edit amount, method, date, reference on recorded supplier payments, and soft-delete mistaken entries. Gate this behind Accounting only.' },
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
          { key: 'purchase.returns.create', label: 'Create Purchase Returns', description: 'Create new purchase return requests' },
          { key: 'purchase.returns.manage', label: 'Edit Purchase Returns',   description: 'Edit and process existing purchase return requests (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Debit Notes',
        permissions: [
          { key: 'purchase.debit_notes.view', label: 'View Debit Notes', description: 'Access the purchase debit notes page' },
        ],
      },
      {
        label: 'Warehouse Operations (legacy alias)',
        permissions: [
          { key: 'purchase.warehouses.view',   label: 'View Warehouse Operations',   description: 'Access stock levels, movements, and transfers' },
          { key: 'purchase.warehouses.manage', label: 'Manage Warehouse Operations', description: 'Create transfers, adjustments, and inventory checks (legacy alias — deprecated)' },
        ],
      },
      {
        label: 'Sale Orders',
        permissions: [
          { key: 'sales.orders.view',   label: 'View Sale Orders',   description: 'View all sale orders and quotations' },
          { key: 'sales.orders.create', label: 'Create Sale Orders', description: 'Draft new sale orders' },
          { key: 'sales.orders.manage', label: 'Edit Sale Orders',   description: 'Edit line items, cancel, void existing sale orders (legacy .manage — alias of .edit)' },
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
          { key: 'sales.invoices.create', label: 'Create Sales Invoices', description: 'Generate new sales invoices' },
          { key: 'sales.invoices.manage', label: 'Edit Sales Invoices',   description: 'Edit and void existing sales invoices (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Customer Payments',
        permissions: [
          { key: 'sales.payments.view',   label: 'View Customer Payments',   description: 'Access customer payment records' },
          { key: 'sales.payments.manage', label: 'Edit / Delete Customer Payments', description: 'Edit amount, method, date, reference on recorded customer payments, and soft-delete mistaken entries. Gate behind Accounting only. Store-credit redemptions cannot be edited here.' },
        ],
      },
      {
        label: 'Sale Returns',
        permissions: [
          { key: 'sales.returns.view',   label: 'View Sale Returns',   description: 'Access sale return records' },
          { key: 'sales.returns.create', label: 'Create Sale Returns', description: 'Create new sale return requests' },
          { key: 'sales.returns.manage', label: 'Edit Sale Returns',   description: 'Edit and process existing sale return requests (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Deliveries',
        permissions: [
          { key: 'sales.deliveries.view',   label: 'View Deliveries',   description: 'Access delivery records and tracking' },
          { key: 'sales.deliveries.create', label: 'Create Deliveries', description: 'Create new delivery records' },
          { key: 'sales.deliveries.manage', label: 'Edit Deliveries',   description: 'Edit and update existing delivery records (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Credit Notes',
        permissions: [
          { key: 'sales.credit_notes.view',   label: 'View Credit Notes',   description: 'Access credit and debit note records' },
          { key: 'sales.credit_notes.create', label: 'Create Credit Notes', description: 'Draft new credit and debit notes' },
          { key: 'sales.credit_notes.manage', label: 'Edit Credit Notes',   description: 'Edit and process existing credit and debit notes (legacy .manage — alias of .edit)' },
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
    module: 'Operations',
    icon: asFC(Flame),
    permissions: [
      { key: 'operations.access', label: 'Access Operations Dropdown', description: 'Show the Operations dropdown in the top nav' },
    ],
    sections: [
      {
        label: 'Custody',
        permissions: [
          { key: 'custody.teams.view',  label: 'View Teams Custody',  description: 'See the Teams tab on the Custody page (stock in team custody)' },
          { key: 'custody.teams.edit',  label: 'Edit Teams Custody',  description: 'Assign / return / consume stock on the Teams tab (rows are created implicitly by upstream flows — no .create key)' },
          { key: 'custody.places.view', label: 'View Places Custody', description: 'See the Places tab on the Custody page (stock at customer sites)' },
          { key: 'custody.places.edit', label: 'Edit Places Custody', description: 'Assign / return / consume stock on the Places tab (rows are created implicitly by upstream flows — no .create key)' },
        ],
      },
      {
        label: 'Consumption',
        permissions: [
          { key: 'consumption.view',            label: 'View Consumption',            description: 'Access the consumption entries list and detail dialog' },
          { key: 'consumption.cost.view',       label: 'View Consumption Cost',       description: 'See unit cost, COGS, and totals on consumption (New dialog, list, and detail). Accounting-only — field users post consumption without seeing cost.' },
          { key: 'consumption.create',          label: 'Create Any Consumption',      description: 'Umbrella create key — grants all three consumer types (team / place / internal). Legacy key retained for backwards compat. Prefer the three narrower keys below.' },
          { key: 'consumption.create.team',     label: 'Create Team Consumption',     description: 'Post consumption entries with a Team consumer' },
          { key: 'consumption.create.place',    label: 'Create Place Consumption',    description: 'Post consumption entries with a Place consumer' },
          { key: 'consumption.create.internal', label: 'Create Internal Consumption', description: 'Post consumption entries with an Internal (own-use) consumer' },
          { key: 'consumption.cancel',          label: 'Cancel Consumption',          description: 'Cancel a posted consumption or approve a cancellation request (acts as .edit for this surface)' },
        ],
      },
      {
        label: 'Damaged Stock',
        permissions: [
          { key: 'damaged_stock.on_hand.view',        label: 'View On-hand Damaged',        description: 'See the On-hand tab on the Damaged Stock page' },
          { key: 'damaged_stock.on_hand.edit',        label: 'Edit On-hand Damaged',        description: 'Send-for-repair / write-off from the On-hand tab (rows are created by receival/return flows — no .create key)' },
          { key: 'damaged_stock.out_for_repair.view', label: 'View Out for Repair',         description: 'See the Out for Repair tab on the Damaged Stock page' },
          { key: 'damaged_stock.out_for_repair.edit', label: 'Edit Out for Repair',         description: 'Assign vendor / return from repair on the Out for Repair tab (no .create key)' },
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
          { key: 'orders.create', label: 'Create Orders', description: 'Create new service orders' },
          { key: 'orders.manage', label: 'Edit Orders',   description: 'Edit and assign existing service orders (legacy .manage — alias of .edit)' },
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
          { key: 'quotations.create', label: 'Create Quotations', description: 'Draft new quotations' },
          { key: 'quotations.manage', label: 'Edit Quotations',   description: 'Edit existing quotations (legacy .manage — alias of .edit)' },
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
          { key: 'contracts.quotations.create', label: 'Create Draft Quotations', description: 'Draft new contract quotations' },
          { key: 'contracts.quotations.manage', label: 'Edit Draft Quotations',   description: 'Edit existing contract quotations (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Live Contracts',
        permissions: [
          { key: 'contracts.live.view',   label: 'View Live Contracts',   description: 'Access the live contracts list and details' },
          { key: 'contracts.live.manage', label: 'Edit Live Contracts',   description: 'Edit and manage active contract details (live contracts are created by activation, not this key — legacy .manage — alias of .edit)' },
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
          { key: 'invoices.create', label: 'Create Invoices', description: 'Draft new invoices' },
          { key: 'invoices.manage', label: 'Edit Invoices',   description: 'Edit and void existing invoices (legacy .manage — alias of .edit)' },
        ],
      },
      {
        label: 'Payments',
        permissions: [
          { key: 'payments.view',   label: 'View Payments',   description: 'Access payment records' },
          { key: 'payments.create', label: 'Create Payments', description: 'Record new payment transactions' },
          { key: 'payments.manage', label: 'Edit Payments',   description: 'Edit and void existing payment transactions (legacy .manage — alias of .edit)' },
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
          { key: 'teams.create',     label: 'Create Teams',     description: 'Add new teams' },
          { key: 'teams.manage',     label: 'Edit Teams',       description: 'Edit and delete existing teams (legacy .manage — alias of .edit)' },
          { key: 'employees.view',   label: 'View Employees',   description: 'Access the employee directory' },
          { key: 'employees.create', label: 'Create Employees', description: 'Add new employee records' },
          { key: 'employees.manage', label: 'Edit Employees',   description: 'Edit and delete existing employee records (legacy .manage — alias of .edit)' },
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
          { key: 'calendar.manage', label: 'Manage Calendar', description: 'Edit visits and reassign teams from the calendar (visits are created by upstream orders — no .create key)' },
        ],
      },
    ],
  },
  {
    module: 'Reports',
    icon: asFC(BarChart2),
    permissions: [
      { key: 'reports.access',          label: 'Access Reports Dropdown', description: 'Show the Reports dropdown in the top nav' },
      { key: 'reports.view',            label: 'View Reports',            description: 'Access the reports section (dashboards + any report a finer permission grants)' },
      { key: 'reports.inventory.view',  label: 'View Inventory Reports',  description: 'Product Cost + Revenue / COGS reports' },
      { key: 'reports.accounting.view', label: 'View Accounting Reports', description: 'Accounts Receivable, Accounts Payable, Cash, and Profit & Loss reports' },
      { key: 'reports.manage',          label: 'Export Reports',          description: 'Export report data to CSV or PDF (reports are read-only — .manage here means "can export")' },
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
      { key: 'contact_centre.view',   label: 'View Contact Centre',   description: 'View the Contact Centre sidebar, chat threads, and customer CRM panel' },
      { key: 'contact_centre.create', label: 'Create Contact Centre', description: 'Start new manual chat threads and create customer tasks' },
      { key: 'contact_centre.edit',   label: 'Edit Contact Centre',   description: 'Reply to threads, edit customer records, complete tasks' },
    ],
  },
]

const MODULE_KEY_MAP: Record<string, string> = {
  'Master Data':          'master_data',
  'Purchase & Sales':     'purchase_sales',
  'Warehouse':            'warehouse',
  'Operations':           'operations',
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

const BRANCH_ENABLED_MODULES = new Set(['master_data', 'purchase_sales', 'warehouse', 'operations'])

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
