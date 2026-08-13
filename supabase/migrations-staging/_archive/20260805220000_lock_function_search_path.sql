-- Fix Supabase database-linter WARN 0011_function_search_path_mutable.
--
-- These 66 functions were created without a locked search_path. If an
-- attacker could create a schema and put a shim table/function earlier
-- in the resolved search_path, the function body would silently read
-- the wrong object. In Supabase only admins create schemas, but pinning
-- search_path is standard defense-in-depth.
--
-- Approach: ALTER FUNCTION ... SET search_path = public, pg_temp.
-- This attaches the config to each function without touching its body
-- (safer than CREATE OR REPLACE rewrites).
-- Generated from live pg_proc on 2026-08-05 against mwvblpgbgxipvrevkeff.

ALTER FUNCTION public._check_attribute_key_branch_unique() SET search_path = public, pg_temp;
ALTER FUNCTION public._return_resolution_status(p_return_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_brand_variant_damaged_qty() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_credit_note_reason_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_credit_note_refund_method_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_currency_id_from_currency() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_currency_id_from_default_currency() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_debit_note_reason_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_payment_method_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public._sync_supplier_country_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.allocate_warehouse_stock(p_brand_variant_id uuid, p_warehouse_id uuid, p_target_qty integer, p_unit_cost numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_reject_pending_on_service_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.bill_line_items_invalidate_parent_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.bills_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.cancel_transfer(p_transfer_id uuid, p_cancelled_by_profile_id uuid, p_cancelled_by_name text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_low_stock_and_notify() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_old_notifications() SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_warranty_expires_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_customer_with_phone(p_name text, p_phone text, p_link_phone text) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_order_with_dates(p_order_id text, p_service_customer_id uuid, p_type text, p_division text, p_status text, p_scheduled_date date, p_total_amount numeric, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_services jsonb, p_visit_dates jsonb, p_assignments jsonb, p_address_id uuid, p_created_by uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_service_customer(p_name text, p_phone text, p_link_phone text) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_site_visit(p_visit_id text, p_service_customer_id uuid, p_status text, p_mode text, p_scheduled_date date, p_address text, p_notes text, p_arrival_phone text, p_attachments jsonb, p_visit_dates jsonb, p_assignments jsonb, p_created_by uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_transfer_v2(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_date date, p_items jsonb, p_notes text, p_created_by_profile_id uuid, p_created_by_name text, p_from_sub_container_id uuid, p_to_sub_container_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_notes_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.debit_notes_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_refresh_warehouse_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_brand_variant_sku() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_check_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_contract_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_order_quotation_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_quotation_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_service_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_transfer_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.has_inventory_manager_role(p_profile_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.invoice_line_items_invalidate_parent_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.invoice_recompute_paid_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.invoices_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_sales_approval_decision() SET search_path = public, pg_temp;
ALTER FUNCTION public.next_delivery_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.payment_bill_allocations_trigger_recompute_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.payments_redirect_to_invoice_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.payments_sync_invoice_id_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.payments_trigger_bill_recompute_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.po_line_items_invalidate_parent_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.purchase_orders_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.reason_list_categories_no_orphan_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.reason_lists_category_must_exist() SET search_path = public, pg_temp;
ALTER FUNCTION public.receival_items_invalidate_parent_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.receivals_invalidate_check_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.receive_transfer(p_transfer_id uuid, p_received_by_profile_id uuid, p_received_by_name text, p_received_items jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.reject_transfer_v2(p_transfer_id uuid, p_rejected_by_profile_id uuid, p_rejected_by_name text) SET search_path = public, pg_temp;
ALTER FUNCTION public.rename_payment_method(p_id uuid, p_new_name text, p_new_slug text) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_customer_statement(p_customer_id uuid, p_date_from date, p_date_to date) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_customer_statement_v2(p_customer_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_financial_dashboard() SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_purchase_aging_report() SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_sales_aging_report() SET search_path = public, pg_temp;
ALTER FUNCTION public.sale_order_lines_invalidate_parent_pdf_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.sale_orders_invalidate_pdf_cache_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.save_order_quotation(p_quotation_id text, p_service_customer_id uuid, p_division text, p_status text, p_total_amount numeric, p_notes text, p_expiry_date date, p_sent_date timestamp with time zone, p_line_items jsonb, p_discount_type text, p_discount_value numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_approval_request_decided_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_service_customers_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sku_abbreviation(input text, len integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_service_pending_lock() SET search_path = public, pg_temp;
ALTER FUNCTION public.warranty_policies_set_updated_at() SET search_path = public, pg_temp;
