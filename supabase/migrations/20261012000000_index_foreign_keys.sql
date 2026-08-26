-- Index every foreign-key column in the public schema that lacks a covering
-- (leading-column) B-tree index. Postgres does NOT auto-index FK columns, so
-- without these, joins on them and ON DELETE cascade/restrict checks fall back
-- to sequential scans and take wider locks. Cheap now (tables are near-empty),
-- but a real cost once the app goes live and these tables fill with data.
--
-- Created now precisely BECAUSE the tables are near-empty: CREATE INDEX is
-- instant and non-blocking on an empty table, whereas post-launch it would need
-- CREATE INDEX CONCURRENTLY + minutes of build time. From the 2026-08-26 prod DB
-- audit (docs/DB Audits/2026-08-26-prod-db-audit.md, finding M3).
--
-- 133 statements, generated from the live catalog on 2026-08-26. Excludes the
-- auth.* / storage.* schemas (Supabase-managed). Idempotent (IF NOT EXISTS) —
-- safe to re-run and identical for staging + new-prod.

CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_archived_by ON public.approval_workflow_steps (archived_by);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_group_id ON public.approval_workflow_steps (group_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_role_id ON public.approval_workflow_steps (role_id);
CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_by ON public.bill_attachments (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_bills_receival_id ON public.bills (receival_id);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies (created_by);
CREATE INDEX IF NOT EXISTS idx_companies_currency_id ON public.companies (currency_id);
CREATE INDEX IF NOT EXISTS idx_company_divisions_company_id ON public.company_divisions (company_id);
CREATE INDEX IF NOT EXISTS idx_company_divisions_created_by ON public.company_divisions (created_by);
CREATE INDEX IF NOT EXISTS idx_company_divisions_currency_id ON public.company_divisions (currency_id);
CREATE INDEX IF NOT EXISTS idx_consumption_edit_requests_requested_by ON public.consumption_edit_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_consumption_edit_requests_reviewed_by ON public.consumption_edit_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_cancelled_by ON public.consumption_entries (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_created_by ON public.consumption_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_consumption_entries_posted_by ON public.consumption_entries (posted_by);
CREATE INDEX IF NOT EXISTS idx_credit_group_payment_methods_payment_method_id ON public.credit_group_payment_methods (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_invoice_line_id ON public.credit_note_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON public.credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_source_return_id ON public.credit_notes (source_return_id);
CREATE INDEX IF NOT EXISTS idx_custom_roles_created_by ON public.custom_roles (created_by);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_approvals_decided_by ON public.customer_credit_group_approvals (decided_by);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_decided_by ON public.customer_credit_group_requests (decided_by);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_previous_group_id ON public.customer_credit_group_requests (previous_group_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_requested_by ON public.customer_credit_group_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_customer_credit_group_requests_requested_group_id ON public.customer_credit_group_requests (requested_group_id);
CREATE INDEX IF NOT EXISTS idx_customers_credit_group_id ON public.customers (credit_group_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rate_change_log_changed_by ON public.exchange_rate_change_log (changed_by);
CREATE INDEX IF NOT EXISTS idx_inventory_attribute_definitions_created_by ON public.inventory_attribute_definitions (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_category_divisions_created_by ON public.inventory_category_divisions (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_check_approvals_check_id ON public.inventory_check_approvals (check_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_approvals_profile_id ON public.inventory_check_approvals (profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_assignments_profile_id ON public.inventory_check_assignments (profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_assignment_id ON public.inventory_check_items (assignment_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_brand_variant_id ON public.inventory_check_items (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_check_id ON public.inventory_check_items (check_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_log_check_id ON public.inventory_check_log (check_id);
CREATE INDEX IF NOT EXISTS idx_inventory_check_log_profile_id ON public.inventory_check_log (profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_checks_initiated_by_profile_id ON public.inventory_checks (initiated_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_movements_created_by ON public.inventory_damaged_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_stock_layers_created_by ON public.inventory_damaged_stock_layers (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_damaged_stock_layers_source_return_line_id ON public.inventory_damaged_stock_layers (source_return_line_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_attributes_updated_by ON public.inventory_item_attributes (updated_by);
CREATE INDEX IF NOT EXISTS idx_inventory_item_divisions_created_by ON public.inventory_item_divisions (created_by);
CREATE INDEX IF NOT EXISTS idx_landed_cost_lines_currency_id ON public.landed_cost_lines (currency_id);
CREATE INDEX IF NOT EXISTS idx_landed_costs_currency_id ON public.landed_costs (currency_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_payment_id ON public.payment_installments (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_plan_id ON public.payment_installments (plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_bill_id ON public.payment_plans (bill_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_invoice_id ON public.payment_plans (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_currency_id ON public.payments (currency_id);
CREATE INDEX IF NOT EXISTS idx_payments_method_id ON public.payments (method_id);
CREATE INDEX IF NOT EXISTS idx_po_edit_requests_requested_by ON public.po_edit_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_po_edit_requests_reviewed_by ON public.po_edit_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quote_items_po_line_item_id ON public.po_rfq_quote_items (po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quotes_currency_id ON public.po_rfq_quotes (currency_id);
CREATE INDEX IF NOT EXISTS idx_po_rfq_quotes_supplier_id ON public.po_rfq_quotes (supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_versions_currency_id ON public.po_versions (currency_id);
CREATE INDEX IF NOT EXISTS idx_po_versions_submitted_by ON public.po_versions (submitted_by);
CREATE INDEX IF NOT EXISTS idx_project_disciplines_created_by ON public.project_disciplines (created_by);
CREATE INDEX IF NOT EXISTS idx_project_disciplines_discipline_id ON public.project_disciplines (discipline_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_created_by ON public.project_milestones (created_by);
CREATE INDEX IF NOT EXISTS idx_project_milestones_discipline_id ON public.project_milestones (discipline_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects (created_by);
CREATE INDEX IF NOT EXISTS idx_projects_responsible_person_profile_id ON public.projects (responsible_person_profile_id);
CREATE INDEX IF NOT EXISTS idx_projects_warehouse_id ON public.projects (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_currency_id ON public.purchase_orders (currency_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_initial_rate_captured_by ON public.purchase_orders (initial_rate_captured_by);
CREATE INDEX IF NOT EXISTS idx_reason_lists_created_by ON public.reason_lists (created_by);
CREATE INDEX IF NOT EXISTS idx_receival_edit_requests_approved_by ON public.receival_edit_requests (approved_by);
CREATE INDEX IF NOT EXISTS idx_receival_edit_requests_requested_by ON public.receival_edit_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_receival_items_sub_container_id ON public.receival_items (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_receivals_carved_from_layer_id ON public.receivals (carved_from_layer_id);
CREATE INDEX IF NOT EXISTS idx_receivals_source_debit_note_id ON public.receivals (source_debit_note_id);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_created_by ON public.repair_vendors (created_by);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_sub_container_id ON public.repair_vendors (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_repair_vendors_virtual_warehouse_id ON public.repair_vendors (virtual_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_created_by ON public.sale_deliveries (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_return_id ON public.sale_deliveries (return_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_sale_order_id ON public.sale_deliveries (sale_order_id);
CREATE INDEX IF NOT EXISTS idx_sale_deliveries_warehouse_id ON public.sale_deliveries (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sale_order_approvals_decided_by ON public.sale_order_approvals (decided_by);
CREATE INDEX IF NOT EXISTS idx_sale_order_approvals_requested_by ON public.sale_order_approvals (requested_by);
CREATE INDEX IF NOT EXISTS idx_sale_order_lines_created_by ON public.sale_order_lines (created_by);
CREATE INDEX IF NOT EXISTS idx_sale_orders_currency_id ON public.sale_orders (currency_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_initial_rate_captured_by ON public.sale_orders (initial_rate_captured_by);
CREATE INDEX IF NOT EXISTS idx_shipments_receival_id ON public.shipments (receival_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_created_by ON public.so_po_returns (created_by);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_credit_note_id ON public.so_po_returns (credit_note_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_division_id ON public.so_po_returns (division_id);
CREATE INDEX IF NOT EXISTS idx_so_po_returns_restock_warehouse_id ON public.so_po_returns (restock_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_approvals_profile_id ON public.stock_adjustment_approvals (profile_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_brand_variant_id ON public.stock_adjustments (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_requested_by ON public.stock_adjustments (requested_by);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_source_check_item_id ON public.stock_adjustments (source_check_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_sub_container_id ON public.stock_adjustments (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_warehouse_id ON public.stock_adjustments (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_country_id ON public.suppliers (country_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_by ON public.suppliers (created_by);
CREATE INDEX IF NOT EXISTS idx_suppliers_currency_id ON public.suppliers (currency_id);
CREATE INDEX IF NOT EXISTS idx_tool_unit_assignments_returned_to_warehouse_id ON public.tool_unit_assignments (returned_to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_tool_unit_inspections_custody_location_id ON public.tool_unit_inspections (custody_location_id);
CREATE INDEX IF NOT EXISTS idx_user_company_divisions_created_by ON public.user_company_divisions (created_by);
CREATE INDEX IF NOT EXISTS idx_user_company_divisions_division_id ON public.user_company_divisions (division_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_created_by ON public.user_custom_roles (created_by);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_role_id ON public.user_custom_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_user_data_active_division_id ON public.user_data (active_division_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_dest_sub_container_id ON public.warehouse_item_requests (dest_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_requested_by ON public.warehouse_item_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_item_requests_resolved_by ON public.warehouse_item_requests (resolved_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_reorder_points_brand_variant_id ON public.warehouse_reorder_points (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_responsible_persons_profile_id ON public.warehouse_responsible_persons (profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_allocations_brand_variant_id ON public.warehouse_stock_allocations (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_allocations_sub_container_id ON public.warehouse_stock_allocations (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_sub_containers_created_by ON public.warehouse_sub_containers (created_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_sub_containers_discipline_id ON public.warehouse_sub_containers (discipline_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_sub_container_id ON public.warehouse_transfer_items (sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_cancelled_by_profile_id ON public.warehouse_transfers (cancelled_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_created_by_profile_id ON public.warehouse_transfers (created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_dispatched_by_profile_id ON public.warehouse_transfers (dispatched_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_from_sub_container_id ON public.warehouse_transfers (from_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_received_by_profile_id ON public.warehouse_transfers (received_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source_return_line_disposition_id ON public.warehouse_transfers (source_return_line_disposition_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_to_sub_container_id ON public.warehouse_transfers (to_sub_container_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_company_id ON public.warehouses (company_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_repair_vendor_id ON public.warehouses (repair_vendor_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_decided_by ON public.warranty_claims (decided_by);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_linked_return_id ON public.warranty_claims (linked_return_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_reported_by ON public.warranty_claims (reported_by);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_voided_by ON public.warranty_claims (voided_by);
CREATE INDEX IF NOT EXISTS idx_warranty_number_counters_division_id ON public.warranty_number_counters (division_id);
CREATE INDEX IF NOT EXISTS idx_warranty_policies_created_by ON public.warranty_policies (created_by);
CREATE INDEX IF NOT EXISTS idx_warranty_records_brand_variant_id ON public.warranty_records (brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_warranty_records_origin_country_id ON public.warranty_records (origin_country_id);
