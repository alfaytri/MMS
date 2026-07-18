-- PostgreSQL does NOT auto-create indexes on FK columns.
-- These indexes cover high-traffic join/filter columns identified in the architecture audit.

-- sale_orders
CREATE INDEX IF NOT EXISTS idx_sale_orders_customer_id ON sale_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_created_by ON sale_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_orders_division_id ON sale_orders (division_id);

-- purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON purchase_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_division_id ON purchase_orders (division_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_id ON purchase_orders (warehouse_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON invoices (supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id ON invoices (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_order_id ON invoices (sale_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_delivery_id ON invoices (sale_delivery_id);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier_id ON payments (supplier_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_division_id ON profiles (division_id);

-- receivals
CREATE INDEX IF NOT EXISTS idx_receivals_warehouse_id ON receivals (warehouse_id);

-- warehouse_transfers
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_warehouse_id ON warehouse_transfers (from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_warehouse_id ON warehouse_transfers (to_warehouse_id);

-- inventory_checks
CREATE INDEX IF NOT EXISTS idx_inventory_checks_warehouse_id ON inventory_checks (warehouse_id);
