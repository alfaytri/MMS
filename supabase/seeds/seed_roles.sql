-- Seed: MMS role catalogue (new-prod). Idempotent — safe to re-run.
-- Generated 2026-08-15. ON CONFLICT (name) refreshes permissions + flags
-- (updated_at bumped); name/color/id/user-assignments are preserved.
-- Admin Level & Owner use system.admin (grants everything, bypasses checks).

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Admin Level', '#7c3aed', ARRAY['system.admin']::text[], true, true, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Owner', '#dc2626', ARRAY['system.admin']::text[], true, true, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Accounting Junior', '#0ea5e9', ARRAY['master_data.access','purchase_sales.access','reports.access','master_data.suppliers.view','master_data.customers.view','purchase.orders.view','sales.orders.view','purchase.bills.view','purchase.bills.create','purchase.payments.view','sales.invoices.view','sales.invoices.create','sales.payments.view','purchase.landed_costs.view','inventory.catalog.view','inventory.pricing.view','purchase.debit_notes.view','sales.credit_notes.view','reports.view','reports.dashboard_finance']::text[], false, false, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Accounting Senior', '#0369a1', ARRAY['master_data.access','purchase_sales.access','reports.access','master_data.suppliers.view','master_data.customers.view','purchase.orders.view','sales.orders.view','purchase.bills.view','purchase.bills.create','purchase.payments.view','sales.invoices.view','sales.invoices.create','sales.payments.view','purchase.landed_costs.view','inventory.catalog.view','inventory.pricing.view','purchase.debit_notes.view','sales.credit_notes.view','reports.view','reports.dashboard_finance','master_data.customers.create','master_data.customers.manage','master_data.customers.change_credit_group','master_data.customers.change_type','purchase.bills.manage','purchase.payments.manage','sales.invoices.manage','sales.payments.manage','sales.approvals.view','sales.approvals.manage','purchase.approvals.view','sales.credit_notes.create','sales.credit_notes.manage','purchase.landed_costs.create','purchase.landed_costs.manage','inventory.pricing.manage','reports.manage','system.export','notify.finance.credit_group','notify.purchase.po_approval']::text[], false, true, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Inventory User', '#22c55e', ARRAY['master_data.access','warehouse.access','operations.access','purchase_sales.access','inventory.catalog.view','purchase.warehouses.view','warehouse.warehouses.view','warehouse.stock.view','warehouse.movements.view','warehouse.transfers.view','warehouse.adjustments.view','warehouse.checks.view','warehouse.receivals.view','warehouse.transfer.create','warehouse.transfer.dispatch','warehouse.transfer.receive','warehouse.adjustment.request','warehouse.check.count','warehouse.check.create','warehouse.responsible_person','purchase.receivals.view','purchase.receivals.create','consumption.view','consumption.create.custody','consumption.create.internal','damaged_stock.on_hand.view','damaged_stock.on_hand.edit','damaged_stock.out_for_repair.view','damaged_stock.out_for_repair.edit']::text[], false, false, true)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Inventory Manager', '#15803d', ARRAY['master_data.access','warehouse.access','operations.access','purchase_sales.access','inventory.catalog.view','purchase.warehouses.view','warehouse.warehouses.view','warehouse.stock.view','warehouse.movements.view','warehouse.transfers.view','warehouse.adjustments.view','warehouse.checks.view','warehouse.receivals.view','warehouse.transfer.create','warehouse.transfer.dispatch','warehouse.transfer.receive','warehouse.adjustment.request','warehouse.check.count','warehouse.check.create','warehouse.responsible_person','purchase.receivals.view','purchase.receivals.create','consumption.view','consumption.create.custody','consumption.create.internal','damaged_stock.on_hand.view','damaged_stock.on_hand.edit','damaged_stock.out_for_repair.view','damaged_stock.out_for_repair.edit','reports.access','inventory.catalog.manage','master_data.inventory.attributes.view','master_data.inventory.attributes.manage','warehouse.settings.manage','warehouse.stock_value.view','warehouse.transfer.approve','master_data.warehouses.view','reports.view','reports.dashboard_finance','notify.warehouse.stock_adj','notify.warehouse.inv_check','notify.warehouse.transfers','warehouse.projects.view','warehouse.projects.manage']::text[], false, true, true)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Purchase User', '#f59e0b', ARRAY['master_data.access','purchase_sales.access','master_data.suppliers.view','master_data.suppliers.create','inventory.catalog.view','purchase.orders.view','purchase.orders.create','purchase.orders.manage','purchase.receivals.view','purchase.receivals.create','purchase.bills.view','purchase.bills.create','purchase.shipments.view','purchase.shipments.create','purchase.shipments.manage','purchase.landed_costs.view','purchase.landed_costs.create','purchase.returns.view','purchase.returns.create','purchase.debit_notes.view','purchase.dead_stock.view']::text[], false, false, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Purchase Manager', '#b45309', ARRAY['master_data.access','purchase_sales.access','master_data.suppliers.view','master_data.suppliers.create','inventory.catalog.view','purchase.orders.view','purchase.orders.create','purchase.orders.manage','purchase.receivals.view','purchase.receivals.create','purchase.bills.view','purchase.bills.create','purchase.shipments.view','purchase.shipments.create','purchase.shipments.manage','purchase.landed_costs.view','purchase.landed_costs.create','purchase.returns.view','purchase.returns.create','purchase.debit_notes.view','purchase.dead_stock.view','warehouse.access','reports.access','master_data.suppliers.manage','purchase.approvals.view','purchase.bills.manage','purchase.receivals.manage','purchase.returns.manage','purchase.landed_costs.manage','purchase.payments.view','warehouse.stock.view','purchase.warehouses.view','reports.view','reports.dashboard_finance','notify.purchase.po_approval','notify.purchase.receival_edit']::text[], false, true, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Warehouse Manager', '#6366f1', ARRAY['master_data.access','warehouse.access','operations.access','purchase_sales.access','warehouse.warehouses.view','warehouse.settings.manage','warehouse.stock.view','warehouse.stock_value.view','warehouse.movements.view','warehouse.receivals.view','purchase.warehouses.view','warehouse.transfers.view','warehouse.transfer.create','warehouse.transfer.dispatch','warehouse.transfer.receive','warehouse.transfer.approve','warehouse.adjustments.view','warehouse.adjustment.request','warehouse.checks.view','warehouse.check.count','warehouse.check.create','warehouse.responsible_person','inventory.catalog.view','master_data.warehouses.view','purchase.receivals.view','purchase.receivals.create','purchase.receivals.manage','sales.deliveries.view','sales.deliveries.create','sales.deliveries.manage','damaged_stock.on_hand.view','damaged_stock.on_hand.edit','damaged_stock.out_for_repair.view','damaged_stock.out_for_repair.edit','consumption.view','notify.warehouse.transfers','notify.warehouse.stock_adj','notify.warehouse.inv_check','warehouse.projects.view','warehouse.projects.manage']::text[], false, true, true)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Sales User', '#ec4899', ARRAY['master_data.access','purchase_sales.access','warehouse.access','master_data.customers.view','master_data.customers.create','inventory.catalog.view','warehouse.stock.view','sales.orders.view','sales.orders.create','sales.orders.manage','sales.invoices.view','sales.invoices.create','sales.deliveries.view','sales.deliveries.create','sales.returns.view','sales.returns.create','sales.credit_notes.view','sales.payments.view']::text[], false, false, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

INSERT INTO public.custom_roles (name, color, permissions, is_system_admin, is_approval_slot, is_inventory_receiver)
VALUES ('Sales Manager', '#be185d', ARRAY['master_data.access','purchase_sales.access','warehouse.access','master_data.customers.view','master_data.customers.create','inventory.catalog.view','warehouse.stock.view','sales.orders.view','sales.orders.create','sales.orders.manage','sales.invoices.view','sales.invoices.create','sales.deliveries.view','sales.deliveries.create','sales.returns.view','sales.returns.create','sales.credit_notes.view','sales.payments.view','reports.access','master_data.customers.manage','sales.invoices.manage','sales.deliveries.manage','sales.returns.manage','sales.credit_notes.create','sales.credit_notes.manage','sales.approvals.view','sales.approvals.manage','reports.view','reports.dashboard_finance']::text[], false, true, false)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  is_system_admin = EXCLUDED.is_system_admin,
  is_approval_slot = EXCLUDED.is_approval_slot,
  is_inventory_receiver = EXCLUDED.is_inventory_receiver,
  updated_at = now();

