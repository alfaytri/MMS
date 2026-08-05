-- Fix Supabase database-linter WARN 0024 (rls_policy_always_true) on the
-- 12 money tables. Before this migration these tables had `USING (true)`
-- and/or `WITH CHECK (true)` policies for writes — any authenticated
-- employee could bypass the UI and mutate them via a client-side
-- Supabase call. The UI was the only guardrail.
--
-- Approach:
--   - Keep SELECT permissive (`USING (true) TO authenticated`). Employees
--     legitimately need to read these rows to work; the linter excludes
--     SELECT-true policies for this reason.
--   - Gate INSERT/UPDATE/DELETE by `_user_has_permission()`. Admins
--     bypass automatically because their role has `is_system = true`.
--
-- Scope of this migration (option B "money tables only" from the audit):
--   bills, bill_line_items                     → purchase.bills.manage
--   so_invoices                                → sales.invoices.manage
--   credit_notes, credit_note_lines            → sales.credit_notes.manage
--   debit_notes, debit_note_lines              → purchase.bills.manage (AP-side, no dedicated permission)
--   payments, payment_bill_allocations,        → purchase.payments.manage
--     payment_installments                       (table is unified AP/AR)
--   customers, customer_phones                 → master_data.customers.manage
--
-- Reference tables (payment_methods, reason_lists, country_codes, etc.)
-- and inventory tables stay permissive — they are accepted low-risk gaps
-- documented in the security audit log.

-- ============================================================
-- 1. bills
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage bills" ON public.bills;

CREATE POLICY "bills_select_authenticated" ON public.bills
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bills_insert_bills_manage" ON public.bills
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "bills_update_bills_manage" ON public.bills
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "bills_delete_bills_manage" ON public.bills
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

-- ============================================================
-- 2. bill_line_items
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage bill_line_items" ON public.bill_line_items;

CREATE POLICY "bill_line_items_select_authenticated" ON public.bill_line_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bill_line_items_insert_bills_manage" ON public.bill_line_items
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "bill_line_items_update_bills_manage" ON public.bill_line_items
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "bill_line_items_delete_bills_manage" ON public.bill_line_items
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

-- ============================================================
-- 3. so_invoices  (already has separate SELECT/INSERT/UPDATE/DELETE policies)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert invoices" ON public.so_invoices;
DROP POLICY IF EXISTS "Authenticated can update invoices" ON public.so_invoices;
DROP POLICY IF EXISTS "Authenticated can delete invoices" ON public.so_invoices;
-- Keep "Authenticated can select invoices" — it's SELECT-true which is accepted.

CREATE POLICY "so_invoices_insert_invoices_manage" ON public.so_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.invoices.manage'));

CREATE POLICY "so_invoices_update_invoices_manage" ON public.so_invoices
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.invoices.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.invoices.manage'));

CREATE POLICY "so_invoices_delete_invoices_manage" ON public.so_invoices
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.invoices.manage'));

-- ============================================================
-- 4. credit_notes
-- ============================================================
DROP POLICY IF EXISTS "Internal can update credit_notes" ON public.credit_notes;
-- Keep "Internal can select credit_notes" — SELECT-true.

CREATE POLICY "credit_notes_insert_manage" ON public.credit_notes
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

CREATE POLICY "credit_notes_update_manage" ON public.credit_notes
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

CREATE POLICY "credit_notes_delete_manage" ON public.credit_notes
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

-- ============================================================
-- 5. credit_note_lines
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage credit_note_lines" ON public.credit_note_lines;

CREATE POLICY "credit_note_lines_select_authenticated" ON public.credit_note_lines
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "credit_note_lines_insert_manage" ON public.credit_note_lines
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

CREATE POLICY "credit_note_lines_update_manage" ON public.credit_note_lines
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

CREATE POLICY "credit_note_lines_delete_manage" ON public.credit_note_lines
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'sales.credit_notes.manage'));

-- ============================================================
-- 6. debit_notes
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage debit_notes" ON public.debit_notes;

CREATE POLICY "debit_notes_select_authenticated" ON public.debit_notes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "debit_notes_insert_bills_manage" ON public.debit_notes
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "debit_notes_update_bills_manage" ON public.debit_notes
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "debit_notes_delete_bills_manage" ON public.debit_notes
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

-- ============================================================
-- 7. debit_note_lines
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage debit_note_lines" ON public.debit_note_lines;

CREATE POLICY "debit_note_lines_select_authenticated" ON public.debit_note_lines
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "debit_note_lines_insert_bills_manage" ON public.debit_note_lines
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "debit_note_lines_update_bills_manage" ON public.debit_note_lines
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

CREATE POLICY "debit_note_lines_delete_bills_manage" ON public.debit_note_lines
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.bills.manage'));

-- ============================================================
-- 8. payments
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage payments" ON public.payments;

CREATE POLICY "payments_select_authenticated" ON public.payments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payments_insert_manage" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payments_update_manage" ON public.payments
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payments_delete_manage" ON public.payments
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

-- ============================================================
-- 9. payment_bill_allocations
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage payment_bill_allocations" ON public.payment_bill_allocations;

CREATE POLICY "payment_bill_allocations_select_authenticated" ON public.payment_bill_allocations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_bill_allocations_insert_manage" ON public.payment_bill_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payment_bill_allocations_update_manage" ON public.payment_bill_allocations
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payment_bill_allocations_delete_manage" ON public.payment_bill_allocations
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

-- ============================================================
-- 10. payment_installments
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage payment_installments" ON public.payment_installments;

CREATE POLICY "payment_installments_select_authenticated" ON public.payment_installments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_installments_insert_manage" ON public.payment_installments
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payment_installments_update_manage" ON public.payment_installments
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

CREATE POLICY "payment_installments_delete_manage" ON public.payment_installments
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'purchase.payments.manage'));

-- ============================================================
-- 11. customers
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage customers" ON public.customers;

CREATE POLICY "customers_select_authenticated" ON public.customers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customers_insert_manage" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

CREATE POLICY "customers_update_manage" ON public.customers
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

CREATE POLICY "customers_delete_manage" ON public.customers
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

-- ============================================================
-- 12. customer_phones
-- ============================================================
DROP POLICY IF EXISTS "Internal users can manage customer_phones" ON public.customer_phones;

CREATE POLICY "customer_phones_select_authenticated" ON public.customer_phones
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_phones_insert_manage" ON public.customer_phones
  FOR INSERT TO authenticated
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

CREATE POLICY "customer_phones_update_manage" ON public.customer_phones
  FOR UPDATE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'))
  WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

CREATE POLICY "customer_phones_delete_manage" ON public.customer_phones
  FOR DELETE TO authenticated
  USING (public._user_has_permission(public._current_user_data_id(), 'master_data.customers.manage'));

NOTIFY pgrst, 'reload schema';
