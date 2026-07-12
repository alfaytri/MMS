-- ============================================================
-- MMS Seed — Custom Roles
-- Source: Dev DB (wkmvjxxmzstsvahuiwsz) — 2026-07-12
-- Run AFTER the baseline schema migration.
--
-- Uses ON CONFLICT (id) DO UPDATE so it's safe to re-run:
--   - Fresh DB: inserts all roles
--   - Existing DB: updates permissions/flags to match
-- ============================================================

BEGIN;

-- ── 1. Admin (system role) ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  'd40b5311-3979-466c-a4cf-84f101360d8f',
  'Admin',
  'Full system access — all modules and all actions.',
  'bg-rose-500/15 text-rose-600 border-rose-500/30',
  ARRAY[
    'master_data.companies.view','master_data.companies.manage',
    'master_data.divisions.view','master_data.divisions.manage',
    'master_data.warehouses.view','master_data.warehouses.manage',
    'master_data.inventory.view','master_data.inventory.manage',
    'master_data.suppliers.view','master_data.suppliers.manage',
    'master_data.users.view','master_data.users.manage',
    'master_data.roles.view','master_data.roles.manage',
    'master_data.audit.view',
    'master_data.admin.view','master_data.admin.manage',
    'purchase.orders.view','purchase.orders.create','purchase.orders.edit',
    'purchase.approvals.view','purchase.approvals.manage',
    'purchase.shipments.view','purchase.shipments.manage',
    'purchase.landed_costs.view','purchase.landed_costs.manage',
    'purchase.warehouses.view','purchase.warehouses.manage',
    'purchase.returns.view','purchase.returns.manage',
    'purchase.dead_stock.view',
    'sales.orders.view','sales.orders.create','sales.orders.edit',
    'sales.returns.view','sales.returns.manage',
    'orders.view','orders.create','orders.edit','orders.assign',
    'contracts.view','contracts.create','contracts.edit',
    'invoices.view','invoices.create','invoices.edit',
    'payments.view','payments.manage',
    'teams.view','teams.manage',
    'employees.view','employees.manage',
    'system.admin','system.import','system.export'
  ],
  true, false, false, false,
  '2026-05-11T14:04:09.092299+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 2. Owner ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '9e27cc16-f1ca-4603-87f7-c5b88f848a8e',
  'Owner',
  'Owner',
  'bg-slate-500/15 text-slate-600 border-slate-500/30',
  ARRAY[
    'master_data.access',
    'master_data.companies.view','master_data.companies.manage',
    'master_data.divisions.view','master_data.divisions.manage',
    'master_data.warehouses.view','master_data.warehouses.manage',
    'master_data.inventory.view','master_data.inventory.manage',
    'master_data.suppliers.view','master_data.suppliers.manage',
    'master_data.customers.view','master_data.customers.manage',
    'master_data.service_customers.view','master_data.service_customers.manage',
    'master_data.services.view','master_data.services.manage','master_data.services.approve',
    'master_data.subscriptions.view','master_data.subscriptions.manage',
    'master_data.users.view','master_data.users.manage',
    'master_data.roles.view','master_data.roles.manage',
    'master_data.audit.view',
    'master_data.admin.view','master_data.admin.manage',
    'purchase_sales.access',
    'purchase.orders.view','purchase.orders.manage',
    'purchase.approvals.view','purchase.approvals.chain.manage','purchase.approvals.bypass',
    'purchase.shipments.view','purchase.shipments.manage',
    'purchase.receivals.view','purchase.receivals.manage',
    'purchase.landed_costs.view','purchase.landed_costs.manage',
    'purchase.bills.view','purchase.bills.manage',
    'purchase.rfq.view','purchase.rfq.manage',
    'purchase.dead_stock.view',
    'purchase.returns.view','purchase.returns.manage',
    'purchase.payments.view','purchase.payments.manage',
    'purchase.warehouses.view','purchase.warehouses.manage',
    'purchase.debit_notes.view',
    'sales.orders.view','sales.orders.manage',
    'sales.invoices.view','sales.invoices.manage',
    'sales.returns.view','sales.returns.manage',
    'sales.deliveries.view','sales.deliveries.manage',
    'sales.credit_notes.view','sales.credit_notes.manage',
    'warehouse.access',
    'warehouse.warehouses.view','warehouse.settings.manage',
    'warehouse.stock.view',
    'warehouse.transfers.view','warehouse.transfer.create','warehouse.transfer.dispatch','warehouse.transfer.receive','warehouse.transfer.approve',
    'warehouse.adjustments.view','warehouse.adjustment.request',
    'warehouse.checks.view','warehouse.check.count','warehouse.check.create',
    'warehouse.stock_value.view','warehouse.movements.view','warehouse.receivals.view',
    'orders.access','orders.view','orders.manage',
    'follow_ups.request','follow_ups.confirm',
    'quotations.view','quotations.manage',
    'contracts.access',
    'contracts.quotations.view','contracts.quotations.manage',
    'contracts.live.view','contracts.live.manage','contracts.activate',
    'invoices.access','invoices.view','invoices.manage',
    'payments.view','payments.manage',
    'teams.access','teams.view','teams.manage',
    'employees.view','employees.manage',
    'teams.team_leader.view','teams.team_leader.manage',
    'teams.map.view','teams.map.manage',
    'calendar.view','calendar.manage',
    'reports.access','reports.view','reports.manage',
    'system.admin','system.import','system.export',
    'contact_centre.view'
  ],
  false, true, false, true,
  '2026-05-11T17:53:16.384403+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 3. Developer ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '93d14418-1407-4107-8f7d-997e8a518444',
  'Developer',
  'Developer',
  'bg-slate-500/15 text-slate-600 border-slate-500/30',
  ARRAY[
    'master_data.companies.view','master_data.companies.manage',
    'master_data.divisions.view','master_data.divisions.manage',
    'master_data.warehouses.view','master_data.warehouses.manage',
    'master_data.inventory.view','master_data.inventory.manage',
    'master_data.suppliers.view','master_data.suppliers.manage',
    'master_data.customers.view','master_data.customers.manage',
    'master_data.service_customers.view','master_data.service_customers.manage',
    'master_data.services.view','master_data.services.manage',
    'master_data.subscriptions.view','master_data.subscriptions.manage',
    'master_data.users.view','master_data.users.manage',
    'master_data.roles.view','master_data.roles.manage',
    'master_data.audit.view',
    'master_data.admin.view','master_data.admin.manage',
    'master_data.access',
    'purchase_sales.access',
    'purchase.orders.view','purchase.orders.manage',
    'purchase.approvals.view','purchase.approvals.chain.manage','purchase.approvals.bypass',
    'purchase.shipments.view','purchase.shipments.manage',
    'purchase.receivals.view','purchase.receivals.manage',
    'purchase.landed_costs.view','purchase.landed_costs.manage',
    'purchase.bills.view','purchase.bills.manage',
    'purchase.rfq.view','purchase.rfq.manage',
    'purchase.dead_stock.view',
    'purchase.returns.view','purchase.returns.manage',
    'purchase.payments.view','purchase.payments.manage',
    'purchase.warehouses.view','purchase.warehouses.manage',
    'purchase.debit_notes.view',
    'sales.orders.view','sales.orders.manage',
    'sales.invoices.view','sales.invoices.manage',
    'sales.returns.view','sales.returns.manage',
    'sales.deliveries.view','sales.deliveries.manage',
    'sales.credit_notes.view','sales.credit_notes.manage',
    'warehouse.access','warehouse.warehouses.view',
    'warehouse.stock.view','warehouse.receivals.view',
    'warehouse.transfers.view','warehouse.adjustments.view',
    'warehouse.checks.view','warehouse.movements.view',
    'orders.access','orders.view','orders.manage',
    'quotations.view','quotations.manage',
    'contracts.access',
    'contracts.quotations.view','contracts.quotations.manage',
    'contracts.live.view','contracts.live.manage',
    'invoices.access','invoices.view','invoices.manage',
    'payments.view','payments.manage',
    'teams.access','teams.view','teams.manage',
    'employees.view','employees.manage',
    'teams.team_leader.view','teams.team_leader.manage',
    'teams.map.view','teams.map.manage',
    'calendar.view','calendar.manage',
    'reports.access','reports.view','reports.manage',
    'system.import','system.export',
    'contact_centre.view'
  ],
  false, false, false, false,
  '2026-05-11T17:53:17.56438+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 4. Purchase & Sales Staff ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  'e94566b2-15e8-4395-9f9d-7b67a6329ed2',
  'Purchase & Sales Staff',
  'Access to Purchase & Sales module, Warehouses, and Services catalog.',
  'bg-blue-500/15 text-blue-600 border-blue-500/30',
  ARRAY[
    'master_data.warehouses.view',
    'master_data.services.view',
    'master_data.suppliers.view','master_data.suppliers.manage',
    'master_data.customers.view','master_data.customers.manage',
    'master_data.inventory.view',
    'master_data.access',
    'warehouse.access','warehouse.warehouses.view',
    'warehouse.stock.view','warehouse.adjustments.view',
    'warehouse.transfers.view','warehouse.movements.view','warehouse.receivals.view',
    'purchase_sales.access',
    'purchase.orders.view','purchase.orders.manage',
    'purchase.approvals.view',
    'purchase.shipments.view','purchase.shipments.manage',
    'purchase.receivals.view','purchase.receivals.manage',
    'purchase.landed_costs.view','purchase.landed_costs.manage',
    'purchase.bills.view','purchase.bills.manage',
    'purchase.rfq.view','purchase.rfq.manage',
    'purchase.dead_stock.view',
    'purchase.returns.view','purchase.returns.manage',
    'purchase.payments.view','purchase.payments.manage',
    'purchase.warehouses.view','purchase.warehouses.manage',
    'purchase.debit_notes.view',
    'sales.orders.view','sales.orders.manage',
    'sales.invoices.view','sales.invoices.manage',
    'sales.returns.view','sales.returns.manage',
    'sales.deliveries.view','sales.deliveries.manage',
    'sales.credit_notes.view','sales.credit_notes.manage'
  ],
  false, false, false, false,
  '2026-06-01T07:02:51.115268+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 5. Inventory Manager ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '01e0c88c-948e-4d8f-b237-1132561f937d',
  'inventory_manager',
  'Inventory Manager — global oversight, approvals, and settings',
  'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create','warehouse.transfer.approve',
    'warehouse.adjustment.request',
    'warehouse.check.count','warehouse.check.create',
    'warehouse.settings.manage',
    'warehouse.access','warehouse.warehouses.view',
    'warehouse.transfers.view','warehouse.adjustments.view','warehouse.checks.view',
    'warehouse.stock_value.view','warehouse.movements.view',
    'master_data.access'
  ],
  false, false, false, false,
  '2026-06-07T12:22:54.466003+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 6. Field RP ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '6874b332-d18e-4e3e-83a2-ec3179b48115',
  'field_rp',
  'Field Responsible Person — physically manages a warehouse',
  'bg-blue-500/15 text-blue-700 border-blue-500/30',
  ARRAY[
    'warehouse.stock.view',
    'warehouse.transfer.create','warehouse.transfer.dispatch','warehouse.transfer.receive',
    'warehouse.adjustment.request',
    'warehouse.check.count',
    'warehouse.access','warehouse.warehouses.view','warehouse.settings.manage',
    'warehouse.transfers.view','warehouse.adjustments.view','warehouse.checks.view',
    'master_data.access'
  ],
  false, false, true, false,
  '2026-06-07T12:22:54.466003+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 7. Brand Manager (approval slot) ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '759f5b55-d6cc-4158-a48f-3f6819f90091',
  'Brand Manager',
  'Approval slot — Brand Manager (damage/write-off)',
  'bg-purple-500/15 text-purple-700 border-purple-500/30',
  ARRAY[]::text[],
  false, true, false, false,
  '2026-06-15T12:58:13.101483+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 8. Employee ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '5c40f5fa-7574-4f47-a10f-ecd617034f07',
  'Employee',
  'Approval slot — Employee',
  'bg-slate-500/15 text-slate-700 border-slate-500/30',
  ARRAY[]::text[],
  false, false, false, false,
  '2026-06-15T12:58:13.101483+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 9. Warehouse Manager (approval slot) ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  'bab487a1-2940-47b3-8800-9031ac33e484',
  'Warehouse Manager',
  'Approval slot — Warehouse Manager',
  'bg-teal-500/15 text-teal-700 border-teal-500/30',
  ARRAY[]::text[],
  false, true, false, false,
  '2026-06-15T12:58:13.101483+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 10. Accountant (approval slot) ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '74406762-3150-49b7-90b7-83f1a4d63af6',
  'Accountant',
  'Approval slot — Accountant',
  'bg-amber-500/15 text-amber-700 border-amber-500/30',
  ARRAY[]::text[],
  false, true, false, false,
  '2026-06-15T12:58:13.101483+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

-- ── 11. Purchase Manager (approval slot) ──
INSERT INTO custom_roles (id, name, description, color, permissions, is_system, is_approval_slot, is_field_rp, is_inventory_receiver, created_at, updated_at)
VALUES (
  '9462dd3c-15d2-4744-a2be-5de2ed694711',
  'Purchase Manager',
  'Approval slot — Purchase Manager (PO chains)',
  'bg-blue-500/15 text-blue-700 border-blue-500/30',
  ARRAY[]::text[],
  false, true, false, false,
  '2026-06-15T12:58:13.101483+00:00', now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_field_rp = EXCLUDED.is_field_rp,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

COMMIT;
