-- Comprehensive RLS fix: enable RLS + permissive authenticated policy on every
-- table that was missing it. Uses DROP POLICY IF EXISTS so it is safe to run
-- multiple times (avoids "policy already exists" errors).

-- ─── po_versions (fix in case policy was missing or partially applied) ────────
ALTER TABLE po_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage po_versions" ON po_versions;
CREATE POLICY "Internal users can manage po_versions"
  ON po_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Initial schema tables (20260416120736) — none had RLS ───────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage customers" ON customers;
CREATE POLICY "Internal users can manage customers"
  ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage customer_addresses" ON customer_addresses;
CREATE POLICY "Internal users can manage customer_addresses"
  ON customer_addresses FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage employees" ON employees;
CREATE POLICY "Internal users can manage employees"
  ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage vehicles" ON vehicles;
CREATE POLICY "Internal users can manage vehicles"
  ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage schedules" ON schedules;
CREATE POLICY "Internal users can manage schedules"
  ON schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage teams" ON teams;
CREATE POLICY "Internal users can manage teams"
  ON teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE team_schedule_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage team_schedule_assignments" ON team_schedule_assignments;
CREATE POLICY "Internal users can manage team_schedule_assignments"
  ON team_schedule_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage services" ON services;
CREATE POLICY "Internal users can manage services"
  ON services FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE instructions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage instructions" ON instructions;
CREATE POLICY "Internal users can manage instructions"
  ON instructions FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage orders" ON orders;
CREATE POLICY "Internal users can manage orders"
  ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE order_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage order_services" ON order_services;
CREATE POLICY "Internal users can manage order_services"
  ON order_services FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE order_team_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage order_team_assignments" ON order_team_assignments;
CREATE POLICY "Internal users can manage order_team_assignments"
  ON order_team_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE order_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage order_log" ON order_log;
CREATE POLICY "Internal users can manage order_log"
  ON order_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage invoices" ON invoices;
CREATE POLICY "Internal users can manage invoices"
  ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage invoice_line_items" ON invoice_line_items;
CREATE POLICY "Internal users can manage invoice_line_items"
  ON invoice_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage payments" ON payments;
CREATE POLICY "Internal users can manage payments"
  ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage quotations" ON quotations;
CREATE POLICY "Internal users can manage quotations"
  ON quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE quotation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage quotation_log" ON quotation_log;
CREATE POLICY "Internal users can manage quotation_log"
  ON quotation_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage contracts" ON contracts;
CREATE POLICY "Internal users can manage contracts"
  ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE contract_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage contract_visits" ON contract_visits;
CREATE POLICY "Internal users can manage contract_visits"
  ON contract_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE contract_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage contract_payments" ON contract_payments;
CREATE POLICY "Internal users can manage contract_payments"
  ON contract_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage inventory_categories" ON inventory_categories;
CREATE POLICY "Internal users can manage inventory_categories"
  ON inventory_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage inventory_items" ON inventory_items;
CREATE POLICY "Internal users can manage inventory_items"
  ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inventory_brand_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage inventory_brand_variants" ON inventory_brand_variants;
CREATE POLICY "Internal users can manage inventory_brand_variants"
  ON inventory_brand_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE fifo_cost_layers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage fifo_cost_layers" ON fifo_cost_layers;
CREATE POLICY "Internal users can manage fifo_cost_layers"
  ON fifo_cost_layers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE tool_asset_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage tool_asset_items" ON tool_asset_items;
CREATE POLICY "Internal users can manage tool_asset_items"
  ON tool_asset_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE tool_asset_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage tool_asset_units" ON tool_asset_units;
CREATE POLICY "Internal users can manage tool_asset_units"
  ON tool_asset_units FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE inventory_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage inventory_groups" ON inventory_groups;
CREATE POLICY "Internal users can manage inventory_groups"
  ON inventory_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage rfqs" ON rfqs;
CREATE POLICY "Internal users can manage rfqs"
  ON rfqs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE rfq_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage rfq_line_items" ON rfq_line_items;
CREATE POLICY "Internal users can manage rfq_line_items"
  ON rfq_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE rfq_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage rfq_quotes" ON rfq_quotes;
CREATE POLICY "Internal users can manage rfq_quotes"
  ON rfq_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE receivals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage receivals" ON receivals;
CREATE POLICY "Internal users can manage receivals"
  ON receivals FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE receival_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage receival_items" ON receival_items;
CREATE POLICY "Internal users can manage receival_items"
  ON receival_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage warehouse_transfers" ON warehouse_transfers;
CREATE POLICY "Internal users can manage warehouse_transfers"
  ON warehouse_transfers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage shipments" ON shipments;
CREATE POLICY "Internal users can manage shipments"
  ON shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE landed_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage landed_costs" ON landed_costs;
CREATE POLICY "Internal users can manage landed_costs"
  ON landed_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE qc_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage qc_checklists" ON qc_checklists;
CREATE POLICY "Internal users can manage qc_checklists"
  ON qc_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE qc_team_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage qc_team_scores" ON qc_team_scores;
CREATE POLICY "Internal users can manage qc_team_scores"
  ON qc_team_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE qc_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage qc_schedule" ON qc_schedule;
CREATE POLICY "Internal users can manage qc_schedule"
  ON qc_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE qc_inspection_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage qc_inspection_results" ON qc_inspection_results;
CREATE POLICY "Internal users can manage qc_inspection_results"
  ON qc_inspection_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE reminder_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage reminder_categories" ON reminder_categories;
CREATE POLICY "Internal users can manage reminder_categories"
  ON reminder_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage reminders" ON reminders;
CREATE POLICY "Internal users can manage reminders"
  ON reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage chat_conversations" ON chat_conversations;
CREATE POLICY "Internal users can manage chat_conversations"
  ON chat_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage chat_messages" ON chat_messages;
CREATE POLICY "Internal users can manage chat_messages"
  ON chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage activity_log" ON activity_log;
CREATE POLICY "Internal users can manage activity_log"
  ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE promotion_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage promotion_campaigns" ON promotion_campaigns;
CREATE POLICY "Internal users can manage promotion_campaigns"
  ON promotion_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE promotion_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage promotion_rules" ON promotion_rules;
CREATE POLICY "Internal users can manage promotion_rules"
  ON promotion_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage vouchers" ON vouchers;
CREATE POLICY "Internal users can manage vouchers"
  ON vouchers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage voucher_redemptions" ON voucher_redemptions;
CREATE POLICY "Internal users can manage voucher_redemptions"
  ON voucher_redemptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Sales expansion tables (20260419000000) ─────────────────────────────────

ALTER TABLE credit_note_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage credit_note_lines" ON credit_note_lines;
CREATE POLICY "Internal users can manage credit_note_lines"
  ON credit_note_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage payment_plans" ON payment_plans;
CREATE POLICY "Internal users can manage payment_plans"
  ON payment_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal users can manage payment_installments" ON payment_installments;
CREATE POLICY "Internal users can manage payment_installments"
  ON payment_installments FOR ALL TO authenticated USING (true) WITH CHECK (true);
