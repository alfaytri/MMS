-- whole-app 06: RLS + policies (live, post-repair)

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cogs_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_group_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_group_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_group_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fifo_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_attribute_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_category_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_check_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_damaged_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_damaged_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_damaged_stock_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_brand_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_cost_item_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_bill_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approval_chain_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rfq_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_rfq_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_version_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reason_list_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reason_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receival_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receival_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_line_customer_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_line_inventory_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_delivery_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.so_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.so_po_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_cleanup_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_asset_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_check_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_unit_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_company_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_item_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_reorder_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_responsible_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_sub_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage activity_log" ON public.activity_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin can insert app_settings" ON public.app_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update app_settings" ON public.app_settings AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read app_settings" ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon read" ON public.app_settings AS PERMISSIVE FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can delete workflow groups" ON public.approval_workflow_groups AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can insert workflow groups" ON public.approval_workflow_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can read workflow groups" ON public.approval_workflow_groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update workflow groups" ON public.approval_workflow_groups AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY workflow_steps_select ON public.approval_workflow_steps AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY bill_attachments_delete_bills_manage ON public.bill_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bill_attachments_insert_bills_manage ON public.bill_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE (b.id = bill_attachments.bill_id)))));
CREATE POLICY bill_attachments_select_via_bill ON public.bill_attachments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE (b.id = bill_attachments.bill_id))));
CREATE POLICY bill_attachments_update_bills_manage ON public.bill_attachments AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bill_line_items_delete_bills_manage ON public.bill_line_items AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bill_line_items_insert_bills_manage ON public.bill_line_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bill_line_items_select_authenticated ON public.bill_line_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY bill_line_items_update_bills_manage ON public.bill_line_items AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY division_scope_delete_r ON public.bill_line_items AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_line_items.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_insert_r ON public.bill_line_items AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_line_items.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_select_r ON public.bill_line_items AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_line_items.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_update_r ON public.bill_line_items AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_line_items.bill_id) AND is_division_visible(b.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_line_items.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY bills_delete_bills_manage ON public.bills AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bills_insert_bills_manage ON public.bills AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY bills_select_authenticated ON public.bills AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY bills_update_bills_manage ON public.bills AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY division_scope_delete_r ON public.bills AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.bills AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.bills AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.bills AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY inv_brand_del ON public.brands AS PERMISSIVE FOR DELETE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY inv_brand_ins ON public.brands AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_can_create_catalog(_current_user_data_id()));
CREATE POLICY inv_brand_select ON public.brands AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_brand_upd ON public.brands AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id())) WITH CHECK (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY "Internal can read cogs_entries" ON public.cogs_entries AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.cogs_entries AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.cogs_entries AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.cogs_entries AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.cogs_entries AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY "Admin can insert companies" ON public.companies AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'master_data.companies.create'::text) OR _user_has_permission(_current_user_data_id(), 'master_data.companies.manage'::text)));
CREATE POLICY "Admin can update companies" ON public.companies AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read companies" ON public.companies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can delete divisions" ON public.company_divisions AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Admin can insert divisions" ON public.company_divisions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'master_data.divisions.create'::text) OR _user_has_permission(_current_user_data_id(), 'master_data.divisions.manage'::text)));
CREATE POLICY "Admin can update divisions" ON public.company_divisions AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read divisions" ON public.company_divisions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ce_edit_requests_insert ON public.consumption_edit_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((requested_by = ( SELECT user_data.id
   FROM user_data
  WHERE (user_data.auth_user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY ce_edit_requests_select ON public.consumption_edit_requests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ce_edit_requests_update ON public.consumption_edit_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((user_custom_roles ucr
     JOIN custom_roles cr ON ((cr.id = ucr.role_id)))
     JOIN user_data ud ON ((ud.id = ucr.profile_id)))
     JOIN approval_workflow_steps aws ON ((aws.role_id = cr.id)))
  WHERE ((ud.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND (aws.workflow = 'consumption_edit'::text) AND (aws.archived_at IS NULL)))));
CREATE POLICY division_scope_delete_r ON public.consumption_entries AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.consumption_entries AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.consumption_entries AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.consumption_entries AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id));
CREATE POLICY p_ce_read ON public.consumption_entries AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY p_ce_write ON public.consumption_entries AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY p_cl_read ON public.consumption_lines AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY p_cl_write ON public.consumption_lines AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Authenticated users can insert country codes" ON public.country_codes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read country codes" ON public.country_codes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update country codes" ON public.country_codes AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage" ON public.credit_group_payment_methods AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read" ON public.credit_group_payment_methods AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can delete credit_groups" ON public.credit_groups AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "authenticated can insert credit_groups" ON public.credit_groups AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can read credit_groups" ON public.credit_groups AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can update credit_groups" ON public.credit_groups AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY credit_note_lines_delete_manage ON public.credit_note_lines AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY credit_note_lines_insert_manage ON public.credit_note_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY credit_note_lines_select_authenticated ON public.credit_note_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY credit_note_lines_update_manage ON public.credit_note_lines AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY "Accounting/admin can insert credit_notes" ON public.credit_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((user_data p
     JOIN user_custom_roles ucr ON ((ucr.profile_id = p.id)))
     JOIN custom_roles cr ON ((cr.id = ucr.role_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.deleted_at IS NULL) AND ((cr.is_system_admin = true) OR ('invoices.manage'::text = ANY (cr.permissions)))))));
CREATE POLICY "Internal can select credit_notes" ON public.credit_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY credit_notes_delete_manage ON public.credit_notes AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY credit_notes_insert_manage ON public.credit_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY credit_notes_update_manage ON public.credit_notes AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.credit_notes.manage'::text));
CREATE POLICY division_scope_delete_r ON public.credit_notes AS RESTRICTIVE FOR DELETE TO public USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_insert_r ON public.credit_notes AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_select_r ON public.credit_notes AS RESTRICTIVE FOR SELECT TO public USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_update_r ON public.credit_notes AS RESTRICTIVE FOR UPDATE TO public USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text]))))) WITH CHECK ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = credit_notes.invoice_id) AND is_division_visible(i.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = credit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((invoice_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY "Authenticated users can insert currencies" ON public.currencies AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update currencies" ON public.currencies AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can view currencies" ON public.currencies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY custom_roles_manage_delete ON public.custom_roles AS PERMISSIVE FOR DELETE TO authenticated USING (_auth_user_has_permission('master_data.roles.manage'::text));
CREATE POLICY custom_roles_manage_insert ON public.custom_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_auth_user_has_permission('master_data.roles.create'::text) OR _auth_user_has_permission('master_data.roles.manage'::text)));
CREATE POLICY custom_roles_manage_update ON public.custom_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (_auth_user_has_permission('master_data.roles.manage'::text)) WITH CHECK (_auth_user_has_permission('master_data.roles.manage'::text));
CREATE POLICY custom_roles_read_all ON public.custom_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY customer_credit_docs_read ON public.customer_credit_docs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY customer_credit_docs_write ON public.customer_credit_docs AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can read credit-group approval slips" ON public.customer_credit_group_approvals AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read credit-group requests" ON public.customer_credit_group_requests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY customer_phones_delete_manage ON public.customer_phones AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text));
CREATE POLICY customer_phones_insert_manage ON public.customer_phones AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text));
CREATE POLICY customer_phones_select_authenticated ON public.customer_phones AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY customer_phones_update_manage ON public.customer_phones AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text));
CREATE POLICY customers_delete_manage ON public.customers AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text));
CREATE POLICY customers_insert_manage ON public.customers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'master_data.customers.create'::text) OR _user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text)));
CREATE POLICY customers_select_authenticated ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY customers_update_manage ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'master_data.customers.manage'::text));
CREATE POLICY debit_note_lines_delete_bills_manage ON public.debit_note_lines AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY debit_note_lines_insert_bills_manage ON public.debit_note_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY debit_note_lines_select_authenticated ON public.debit_note_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY debit_note_lines_update_bills_manage ON public.debit_note_lines AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY debit_notes_delete_bills_manage ON public.debit_notes AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY debit_notes_insert_bills_manage ON public.debit_notes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY debit_notes_select_authenticated ON public.debit_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY debit_notes_update_bills_manage ON public.debit_notes AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.bills.manage'::text));
CREATE POLICY division_scope_delete_r ON public.debit_notes AS RESTRICTIVE FOR DELETE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = debit_notes.bill_id) AND is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_insert_r ON public.debit_notes AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = debit_notes.bill_id) AND is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_select_r ON public.debit_notes AS RESTRICTIVE FOR SELECT TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = debit_notes.bill_id) AND is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY division_scope_update_r ON public.debit_notes AS RESTRICTIVE FOR UPDATE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = debit_notes.bill_id) AND is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text]))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = debit_notes.bill_id) AND is_division_visible(b.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = debit_notes.source_return_id) AND is_division_visible(r.division_id))))) OR ((bill_id IS NULL) AND (source_return_id IS NULL) AND ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])))));
CREATE POLICY disciplines_read ON public.disciplines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY disciplines_write ON public.disciplines AS PERMISSIVE FOR ALL TO authenticated USING (_auth_user_has_permission('warehouse.projects.manage'::text)) WITH CHECK (_auth_user_has_permission('warehouse.projects.manage'::text));
CREATE POLICY exchange_rate_change_log_no_client_write ON public.exchange_rate_change_log AS PERMISSIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY exchange_rate_change_log_read ON public.exchange_rate_change_log AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal users can manage fifo_cost_layers" ON public.fifo_cost_layers AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sub_container_scope_delete_r ON public.fifo_cost_layers AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.fifo_cost_layers AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.fifo_cost_layers AS RESTRICTIVE FOR SELECT TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.fifo_cost_layers AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY iad_read ON public.inventory_attribute_definitions AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY iad_write ON public.inventory_attribute_definitions AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY iao_read ON public.inventory_attribute_options AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY iao_write ON public.inventory_attribute_options AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY inv_cat_del ON public.inventory_categories AS PERMISSIVE FOR DELETE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY inv_cat_ins ON public.inventory_categories AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_can_create_catalog(_current_user_data_id()));
CREATE POLICY inv_cat_select ON public.inventory_categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_cat_upd ON public.inventory_categories AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id())) WITH CHECK (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY icd_select ON public.inventory_category_divisions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can manage inventory_check_approvals" ON public.inventory_check_approvals AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can manage inventory_check_assignments" ON public.inventory_check_assignments AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can manage inventory_check_items" ON public.inventory_check_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can manage inventory_check_log" ON public.inventory_check_log AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can manage inventory_checks" ON public.inventory_checks AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_idm_read ON public.inventory_damaged_movements AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY p_ids_read ON public.inventory_damaged_stock AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY p_idsl_read ON public.inventory_damaged_stock_layers AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY iia_read ON public.inventory_item_attributes AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY iia_write ON public.inventory_item_attributes AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY inv_var_del ON public.inventory_item_brand_variants AS PERMISSIVE FOR DELETE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY inv_var_ins ON public.inventory_item_brand_variants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_can_create_catalog(_current_user_data_id()));
CREATE POLICY inv_var_select ON public.inventory_item_brand_variants AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_var_upd ON public.inventory_item_brand_variants AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id())) WITH CHECK (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY iid_del ON public.inventory_item_divisions AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY iid_ins ON public.inventory_item_divisions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY iid_select ON public.inventory_item_divisions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY iid_upd ON public.inventory_item_divisions AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY inv_item_del ON public.inventory_items AS PERMISSIVE FOR DELETE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY inv_item_ins ON public.inventory_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_can_create_catalog(_current_user_data_id()));
CREATE POLICY inv_item_select ON public.inventory_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_item_upd ON public.inventory_items AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_can_edit_catalog(_current_user_data_id())) WITH CHECK (_user_can_edit_catalog(_current_user_data_id()));
CREATE POLICY "Internal can read stock_movements" ON public.inventory_stock_movements AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_delete_r ON public.inventory_stock_movements AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.inventory_stock_movements AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.inventory_stock_movements AS RESTRICTIVE FOR SELECT TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.inventory_stock_movements AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY "Internal users can manage invoice_line_items" ON public.invoice_line_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.invoice_line_items AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND is_division_visible(i.division_id)))));
CREATE POLICY division_scope_insert_r ON public.invoice_line_items AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND is_division_visible(i.division_id)))));
CREATE POLICY division_scope_select_r ON public.invoice_line_items AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND is_division_visible(i.division_id)))));
CREATE POLICY division_scope_update_r ON public.invoice_line_items AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND is_division_visible(i.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND is_division_visible(i.division_id)))));
CREATE POLICY landed_cost_item_alloc_read ON public.landed_cost_item_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY landed_cost_item_alloc_write ON public.landed_cost_item_allocations AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY landed_cost_lines_read ON public.landed_cost_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY landed_cost_lines_write ON public.landed_cost_lines AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "Internal users can manage landed_costs" ON public.landed_costs AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_all_notifications ON public.notifications AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY notifications_delete_own ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING ((profile_id = _current_user_data_id()));
CREATE POLICY notifications_insert_any ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY notifications_select_own ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((profile_id = _current_user_data_id()));
CREATE POLICY notifications_update_any ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.payment_bill_allocations AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_insert_r ON public.payment_bill_allocations AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_select_r ON public.payment_bill_allocations AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY division_scope_update_r ON public.payment_bill_allocations AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND is_division_visible(b.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_bill_allocations.bill_id) AND is_division_visible(b.division_id)))));
CREATE POLICY payment_bill_allocations_delete_manage ON public.payment_bill_allocations AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payment_bill_allocations_insert_manage ON public.payment_bill_allocations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payment_bill_allocations_select_authenticated ON public.payment_bill_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY payment_bill_allocations_update_manage ON public.payment_bill_allocations AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payment_installments_delete_manage ON public.payment_installments AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payment_installments_insert_manage ON public.payment_installments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payment_installments_select_authenticated ON public.payment_installments AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY payment_installments_update_manage ON public.payment_installments AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY "Authenticated users can insert payment_methods" ON public.payment_methods AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read payment_methods" ON public.payment_methods AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update payment_methods" ON public.payment_methods AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can manage payment_plans" ON public.payment_plans AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.payment_plans AS RESTRICTIVE FOR DELETE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_plans.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_division_visible(i.division_id)))))));
CREATE POLICY division_scope_insert_r ON public.payment_plans AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_plans.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_division_visible(i.division_id)))))));
CREATE POLICY division_scope_select_r ON public.payment_plans AS RESTRICTIVE FOR SELECT TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_plans.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_division_visible(i.division_id)))))));
CREATE POLICY division_scope_update_r ON public.payment_plans AS RESTRICTIVE FOR UPDATE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_plans.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_division_visible(i.division_id))))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payment_plans.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_division_visible(i.division_id)))))));
CREATE POLICY division_scope_delete_r ON public.payments AS RESTRICTIVE FOR DELETE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payments.invoice_id) AND is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = payments.source_id) AND is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = payments.source_id) AND is_division_visible(so.division_id)))))));
CREATE POLICY division_scope_insert_r ON public.payments AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payments.invoice_id) AND is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = payments.source_id) AND is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = payments.source_id) AND is_division_visible(so.division_id)))))));
CREATE POLICY division_scope_select_r ON public.payments AS RESTRICTIVE FOR SELECT TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payments.invoice_id) AND is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = payments.source_id) AND is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = payments.source_id) AND is_division_visible(so.division_id)))))));
CREATE POLICY division_scope_update_r ON public.payments AS RESTRICTIVE FOR UPDATE TO public USING ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payments.invoice_id) AND is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = payments.source_id) AND is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = payments.source_id) AND is_division_visible(so.division_id))))))) WITH CHECK ((((bill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = payments.bill_id) AND is_division_visible(b.division_id))))) OR ((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM so_invoices i
  WHERE ((i.id = payments.invoice_id) AND is_division_visible(i.division_id))))) OR ((source_type = 'purchase_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = payments.source_id) AND is_division_visible(po.division_id))))) OR ((source_type = 'sale_order'::payment_source_type) AND (EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = payments.source_id) AND is_division_visible(so.division_id)))))));
CREATE POLICY payments_delete_manage ON public.payments AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY payments_insert_manage ON public.payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((((invoice_id IS NOT NULL) OR (source_type = 'sale_order'::payment_source_type)) AND (_user_has_permission(_current_user_data_id(), 'sales.payments.record'::text) OR _user_has_permission(_current_user_data_id(), 'sales.payments.manage'::text))) OR (((bill_id IS NOT NULL) OR (source_type = 'purchase_order'::payment_source_type)) AND (_user_has_permission(_current_user_data_id(), 'purchase.payments.record'::text) OR _user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text)))));
CREATE POLICY payments_no_direct_cn_insert ON public.payments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((credit_note_id IS NULL));
CREATE POLICY payments_select_authenticated ON public.payments AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY payments_update_manage ON public.payments AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'purchase.payments.manage'::text));
CREATE POLICY allow_all_approval_chain_tiers ON public.po_approval_chain_tiers AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_all_approval_chains ON public.po_approval_chains AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.po_approval_chains AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.po_approval_chains AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.po_approval_chains AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.po_approval_chains AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY po_approvals_select ON public.po_approvals AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY po_edit_requests_insert ON public.po_edit_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((requested_by = ( SELECT user_data.id
   FROM user_data
  WHERE (user_data.auth_user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY po_edit_requests_select ON public.po_edit_requests AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY po_edit_requests_update ON public.po_edit_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((user_custom_roles ucr
     JOIN custom_roles cr ON ((cr.id = ucr.role_id)))
     JOIN user_data p ON ((p.id = ucr.profile_id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cr.is_approval_slot = true) AND (cr.deleted_at IS NULL)))));
CREATE POLICY "Internal users can manage po_line_items" ON public.po_line_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.po_line_items AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_insert_r ON public.po_line_items AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_select_r ON public.po_line_items AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_update_r ON public.po_line_items AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND is_division_visible(po.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = po_line_items.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY po_rfq_quote_items_delete ON public.po_rfq_quote_items AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY po_rfq_quote_items_insert ON public.po_rfq_quote_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY po_rfq_quote_items_select ON public.po_rfq_quote_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY po_rfq_quote_items_update ON public.po_rfq_quote_items AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY po_rfq_quotes_delete ON public.po_rfq_quotes AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY po_rfq_quotes_insert ON public.po_rfq_quotes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY po_rfq_quotes_select ON public.po_rfq_quotes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY po_rfq_quotes_update ON public.po_rfq_quotes AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete po_version_lines" ON public.po_version_lines AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert po_version_lines" ON public.po_version_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read po_version_lines" ON public.po_version_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal users can manage po_versions" ON public.po_versions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY project_disciplines_select ON public.project_disciplines AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_disciplines.project_id) AND is_division_visible(p.division_id)))));
CREATE POLICY project_disciplines_write ON public.project_disciplines AS PERMISSIVE FOR ALL TO authenticated USING (_auth_user_has_permission('warehouse.projects.manage'::text)) WITH CHECK (_auth_user_has_permission('warehouse.projects.manage'::text));
CREATE POLICY pm_read ON public.project_milestones AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM warehouse_sub_containers sc
  WHERE ((sc.id = project_milestones.sub_container_id) AND is_division_visible(sc.division_id)))));
CREATE POLICY pm_write ON public.project_milestones AS PERMISSIVE FOR ALL TO authenticated USING (_auth_user_has_permission('warehouse.projects.manage'::text)) WITH CHECK (_auth_user_has_permission('warehouse.projects.manage'::text));
CREATE POLICY projects_read ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING (is_division_visible(division_id));
CREATE POLICY projects_write ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING (_auth_user_has_permission('warehouse.projects.manage'::text)) WITH CHECK (_auth_user_has_permission('warehouse.projects.manage'::text));
CREATE POLICY division_scope_delete ON public.purchase_orders AS PERMISSIVE FOR DELETE TO public USING (
CASE
    WHEN (cardinality(division_ids) > 0) THEN is_any_division_visible(division_ids)
    ELSE is_division_visible(division_id)
END);
CREATE POLICY division_scope_insert ON public.purchase_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (
CASE
    WHEN (cardinality(division_ids) > 0) THEN is_any_division_visible(division_ids)
    ELSE is_division_visible(division_id)
END);
CREATE POLICY division_scope_select ON public.purchase_orders AS PERMISSIVE FOR SELECT TO public USING (
CASE
    WHEN (cardinality(division_ids) > 0) THEN is_any_division_visible(division_ids)
    ELSE is_division_visible(division_id)
END);
CREATE POLICY division_scope_update ON public.purchase_orders AS PERMISSIVE FOR UPDATE TO public USING (
CASE
    WHEN (cardinality(division_ids) > 0) THEN is_any_division_visible(division_ids)
    ELSE is_division_visible(division_id)
END) WITH CHECK (
CASE
    WHEN (cardinality(division_ids) > 0) THEN is_any_division_visible(division_ids)
    ELSE is_division_visible(division_id)
END);
CREATE POLICY "Admins can manage reason_list_categories" ON public.reason_list_categories AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can read reason_list_categories" ON public.reason_list_categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage reason_lists" ON public.reason_lists AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can manage receival_edit_requests" ON public.receival_edit_requests AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can manage receival_items" ON public.receival_items AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sub_container_scope_delete_r ON public.receival_items AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.receival_items AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.receival_items AS RESTRICTIVE FOR SELECT TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.receival_items AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY "Internal users can manage receivals" ON public.receivals AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.receivals AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.receivals AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.receivals AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.receivals AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY p_rv_read ON public.repair_vendors AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY p_rv_write ON public.repair_vendors AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY return_line_customer_resolutions_select ON public.return_line_customer_resolutions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY return_line_inventory_dispositions_select ON public.return_line_inventory_dispositions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.return_lines AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND is_division_visible(r.division_id)))));
CREATE POLICY division_scope_insert_r ON public.return_lines AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND is_division_visible(r.division_id)))));
CREATE POLICY division_scope_select_r ON public.return_lines AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND is_division_visible(r.division_id)))));
CREATE POLICY division_scope_update_r ON public.return_lines AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND is_division_visible(r.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM so_po_returns r
  WHERE ((r.id = return_lines.return_id) AND is_division_visible(r.division_id)))));
CREATE POLICY return_lines_read ON public.return_lines AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY return_lines_write ON public.return_lines AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "Internal can insert sale_deliveries" ON public.sale_deliveries AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select sale_deliveries" ON public.sale_deliveries AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update sale_deliveries" ON public.sale_deliveries AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.sale_deliveries AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_insert_r ON public.sale_deliveries AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_select_r ON public.sale_deliveries AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_update_r ON public.sale_deliveries AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_deliveries.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_delete_r ON public.sale_delivery_lines AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_insert_r ON public.sale_delivery_lines AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_select_r ON public.sale_delivery_lines AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_update_r ON public.sale_delivery_lines AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (sale_deliveries d
     JOIN sale_orders so ON ((so.id = d.sale_order_id)))
  WHERE ((d.id = sale_delivery_lines.sale_delivery_id) AND is_division_visible(so.division_id)))));
CREATE POLICY sale_delivery_lines_read ON public.sale_delivery_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sale_delivery_lines_write ON public.sale_delivery_lines AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "Internal can insert approval_requests" ON public.sale_order_approvals AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select approval_requests" ON public.sale_order_approvals AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update approval_requests" ON public.sale_order_approvals AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete sale_order_lines" ON public.sale_order_lines AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Internal can insert sale_order_lines" ON public.sale_order_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select sale_order_lines" ON public.sale_order_lines AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update sale_order_lines" ON public.sale_order_lines AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.sale_order_lines AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_insert_r ON public.sale_order_lines AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_select_r ON public.sale_order_lines AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_update_r ON public.sale_order_lines AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND is_division_visible(so.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sale_orders so
  WHERE ((so.id = sale_order_lines.sale_order_id) AND is_division_visible(so.division_id)))));
CREATE POLICY division_scope_delete ON public.sale_orders AS PERMISSIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert ON public.sale_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select ON public.sale_orders AS PERMISSIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update ON public.sale_orders AS PERMISSIVE FOR UPDATE TO public USING (is_division_visible(division_id));
CREATE POLICY "Internal users can manage shipments" ON public.shipments AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY division_scope_delete_r ON public.shipments AS RESTRICTIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = shipments.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_insert_r ON public.shipments AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = shipments.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_select_r ON public.shipments AS RESTRICTIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = shipments.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY division_scope_update_r ON public.shipments AS RESTRICTIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = shipments.po_id) AND is_division_visible(po.division_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = shipments.po_id) AND is_division_visible(po.division_id)))));
CREATE POLICY "Authenticated can select invoices" ON public.so_invoices AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.so_invoices AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.so_invoices AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.so_invoices AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.so_invoices AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY so_invoices_delete_invoices_manage ON public.so_invoices AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.invoices.manage'::text));
CREATE POLICY so_invoices_insert_invoices_manage ON public.so_invoices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.invoices.manage'::text));
CREATE POLICY so_invoices_update_invoices_manage ON public.so_invoices AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'sales.invoices.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'sales.invoices.manage'::text));
CREATE POLICY "Internal can insert returns" ON public.so_po_returns AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select returns" ON public.so_po_returns AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update returns" ON public.so_po_returns AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY division_scope_delete_r ON public.so_po_returns AS RESTRICTIVE FOR DELETE TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_insert_r ON public.so_po_returns AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_division_visible(division_id));
CREATE POLICY division_scope_select_r ON public.so_po_returns AS RESTRICTIVE FOR SELECT TO public USING (is_division_visible(division_id));
CREATE POLICY division_scope_update_r ON public.so_po_returns AS RESTRICTIVE FOR UPDATE TO public USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
CREATE POLICY "authenticated can manage stock_adjustment_approvals" ON public.stock_adjustment_approvals AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can create adjustments" ON public.stock_adjustments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can update adjustments" ON public.stock_adjustments AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view adjustments" ON public.stock_adjustments AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_delete_r ON public.stock_adjustments AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.stock_adjustments AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.stock_adjustments AS RESTRICTIVE FOR SELECT TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.stock_adjustments AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY "Internal users can insert suppliers" ON public.suppliers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'master_data.suppliers.create'::text) OR _user_has_permission(_current_user_data_id(), 'master_data.suppliers.manage'::text)));
CREATE POLICY "Internal users can update suppliers" ON public.suppliers AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view suppliers" ON public.suppliers AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tau_del ON public.tool_asset_units AS PERMISSIVE FOR DELETE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY tau_ins ON public.tool_asset_units AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY tau_select ON public.tool_asset_units AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tau_upd ON public.tool_asset_units AS PERMISSIVE FOR UPDATE TO authenticated USING (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'::text));
CREATE POLICY tcs_select ON public.tool_check_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tcs_write ON public.tool_check_sessions AS PERMISSIVE FOR ALL TO authenticated USING (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text));
CREATE POLICY tua_ledger_select ON public.tool_unit_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tua_ledger_write ON public.tool_unit_assignments AS PERMISSIVE FOR ALL TO authenticated USING (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text));
CREATE POLICY tui_select ON public.tool_unit_inspections AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY tui_write ON public.tool_unit_inspections AS PERMISSIVE FOR ALL TO authenticated USING (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text)) WITH CHECK (_user_has_permission(_current_user_data_id(), 'tools.assets.manage'::text));
CREATE POLICY "Admins can manage user_divisions" ON public.user_company_divisions AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY user_custom_roles_manage_delete ON public.user_custom_roles AS PERMISSIVE FOR DELETE TO authenticated USING (_auth_user_has_permission('master_data.roles.manage'::text));
CREATE POLICY user_custom_roles_manage_insert ON public.user_custom_roles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (_auth_user_has_permission('master_data.roles.manage'::text));
CREATE POLICY user_custom_roles_manage_update ON public.user_custom_roles AS PERMISSIVE FOR UPDATE TO authenticated USING (_auth_user_has_permission('master_data.roles.manage'::text)) WITH CHECK (_auth_user_has_permission('master_data.roles.manage'::text));
CREATE POLICY user_custom_roles_read_all ON public.user_custom_roles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_delete_admin ON public.user_data AS PERMISSIVE FOR DELETE TO authenticated USING (has_admin_permission());
CREATE POLICY profiles_insert_own ON public.user_data AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY profiles_select_all ON public.user_data AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update ON public.user_data AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR has_admin_permission())) WITH CHECK (((auth_user_id = ( SELECT auth.uid() AS uid)) OR has_admin_permission()));
CREATE POLICY wir_select_rp_or_superviewer ON public.warehouse_item_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM warehouse_responsible_persons wrp
  WHERE ((wrp.warehouse_id = warehouse_item_requests.warehouse_id) AND (wrp.profile_id = _current_user_data_id())))) OR ((auth.jwt() ->> 'user_type'::text) = ANY (ARRAY['owner'::text, 'accountant'::text])) OR _auth_user_has_permission('system.admin'::text)));
CREATE POLICY "Authenticated users can delete warehouse_reorder_points" ON public.warehouse_reorder_points AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert warehouse_reorder_points" ON public.warehouse_reorder_points AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read warehouse_reorder_points" ON public.warehouse_reorder_points AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update warehouse_reorder_points" ON public.warehouse_reorder_points AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can read warehouse_field_rps" ON public.warehouse_responsible_persons AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read warehouse_stock_allocations" ON public.warehouse_stock_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR SELECT TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_stock_allocations AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY "Authenticated users can read stock summary" ON public.warehouse_stock_summary AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR DELETE TO public USING ((is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = _current_user_data_id()))))));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = _current_user_data_id()))))));
CREATE POLICY sub_container_scope_select_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR SELECT TO public USING ((is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = _current_user_data_id()))))));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_sub_containers AS RESTRICTIVE FOR UPDATE TO public USING ((is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = _current_user_data_id())))))) WITH CHECK ((is_division_visible(division_id) OR (EXISTS ( SELECT 1
   FROM warehouse_responsible_persons rp
  WHERE ((rp.warehouse_id = warehouse_sub_containers.warehouse_id) AND (rp.profile_id = _current_user_data_id()))))));
CREATE POLICY wsc_authenticated_all ON public.warehouse_sub_containers AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can read warehouse_transfer_items" ON public.warehouse_transfer_items AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR DELETE TO public USING (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR INSERT TO public WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR SELECT TO public USING ((is_sub_container_visible(sub_container_id) OR (EXISTS ( SELECT 1
   FROM warehouse_transfers t
  WHERE ((t.id = warehouse_transfer_items.transfer_id) AND (is_sub_container_visible(t.from_sub_container_id) OR is_sub_container_visible(t.to_sub_container_id)))))));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfer_items AS RESTRICTIVE FOR UPDATE TO public USING (is_sub_container_visible(sub_container_id)) WITH CHECK (is_sub_container_visible(sub_container_id));
CREATE POLICY "Internal users can manage warehouse_transfers" ON public.warehouse_transfers AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sub_container_scope_delete_r ON public.warehouse_transfers AS RESTRICTIVE FOR DELETE TO public USING ((is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id)));
CREATE POLICY sub_container_scope_insert_r ON public.warehouse_transfers AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id)));
CREATE POLICY sub_container_scope_select_r ON public.warehouse_transfers AS RESTRICTIVE FOR SELECT TO public USING ((is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id)));
CREATE POLICY sub_container_scope_update_r ON public.warehouse_transfers AS RESTRICTIVE FOR UPDATE TO public USING ((is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id))) WITH CHECK ((is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id)));
CREATE POLICY "Internal users can delete warehouses" ON public.warehouses AS PERMISSIVE FOR DELETE TO authenticated USING (true);
CREATE POLICY "Internal users can insert warehouses" ON public.warehouses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((_user_has_permission(_current_user_data_id(), 'master_data.warehouses.create'::text) OR _user_has_permission(_current_user_data_id(), 'master_data.warehouses.manage'::text)));
CREATE POLICY "Internal users can update warehouses" ON public.warehouses AS PERMISSIVE FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view warehouses" ON public.warehouses AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY sub_container_scope_select_r ON public.warehouses AS RESTRICTIVE FOR SELECT TO public USING (((is_virtual = true) OR (NOT (EXISTS ( SELECT 1
   FROM warehouse_sub_containers sc
  WHERE (sc.warehouse_id = warehouses.id)))) OR (EXISTS ( SELECT 1
   FROM warehouse_sub_containers sc
  WHERE ((sc.warehouse_id = warehouses.id) AND is_sub_container_visible(sc.id))))));
CREATE POLICY warranty_claims_select ON public.warranty_claims AS PERMISSIVE FOR SELECT TO authenticated USING (is_division_visible(division_id));
CREATE POLICY warranty_number_counters_select ON public.warranty_number_counters AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage warranty_policies" ON public.warranty_policies AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can read warranty_policies" ON public.warranty_policies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY warranty_records_division_delete ON public.warranty_records AS PERMISSIVE FOR DELETE TO authenticated USING (is_division_visible(division_id));
CREATE POLICY warranty_records_division_insert ON public.warranty_records AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_division_visible(division_id));
CREATE POLICY warranty_records_division_select ON public.warranty_records AS PERMISSIVE FOR SELECT TO authenticated USING (is_division_visible(division_id));
CREATE POLICY warranty_records_division_update ON public.warranty_records AS PERMISSIVE FOR UPDATE TO authenticated USING (is_division_visible(division_id)) WITH CHECK (is_division_visible(division_id));
