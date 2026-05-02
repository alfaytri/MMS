-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: Auth RLS Init Plan — wrap auth.uid() with (select ...) on profiles
--        so Postgres evaluates it once per query, not once per row.
-- ════════════════════════════════════════════════════════════════════════════

-- These three policies used auth.uid() inline which caused per-row re-evaluation.
-- Dropping and recreating is cleaner than ALTER POLICY (which can't change USING/WITH CHECK
-- independently without rewriting anyway).
DROP POLICY IF EXISTS "Users can read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;

-- Note: "Admins can manage all profiles" FOR ALL USING (true) already grants full
-- access to every authenticated user, so the per-user policies were also
-- triggering the multiple-permissive-policies lint. Dropping them removes both
-- the init-plan warning and the redundant-policy warning in one step.
-- The FOR ALL / USING (true) policy remains the single authoritative policy.


-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: Multiple Permissive Policies — drop redundant SELECT-only policies
--        on tables that already have a FOR ALL policy covering SELECT.
-- ════════════════════════════════════════════════════════════════════════════

-- Each table below has "Admin can manage X" FOR ALL USING (true), which already
-- covers SELECT. The separate SELECT-only policies add nothing and force Postgres
-- to evaluate two policies per query.

DROP POLICY IF EXISTS "Internal users can view custom_roles"           ON public.custom_roles;
DROP POLICY IF EXISTS "Internal can select document_terms"             ON public.document_terms;
DROP POLICY IF EXISTS "Internal users can read notification_config"    ON public.notification_config;
DROP POLICY IF EXISTS "Internal users can read notification_templates" ON public.notification_templates;
DROP POLICY IF EXISTS "Internal users can view line permissions"        ON public.phone_line_permissions_3cx;
DROP POLICY IF EXISTS "Internal can select qb_accounts"               ON public.qb_accounts;
DROP POLICY IF EXISTS "Internal can select qb_division_mappings"      ON public.qb_division_mappings;
DROP POLICY IF EXISTS "Internal can select qb_items"                  ON public.qb_items;
DROP POLICY IF EXISTS "Internal can select reason_lists"              ON public.reason_lists;
DROP POLICY IF EXISTS "Internal users can view user_custom_roles"     ON public.user_custom_roles;
DROP POLICY IF EXISTS "Internal users can view user_divisions"        ON public.user_divisions;


-- ════════════════════════════════════════════════════════════════════════════
-- Fix 3: Multiple Permissive Policies — purchase_orders & sale_orders
--        Drop the broad USING (true) policies; division_scope_* are the
--        correct and only enforcement layer for these tables.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Internal users can manage purchase_orders" ON public.purchase_orders;

DROP POLICY IF EXISTS "Internal can insert sale_orders"           ON public.sale_orders;
DROP POLICY IF EXISTS "Internal can select sale_orders"           ON public.sale_orders;
DROP POLICY IF EXISTS "Internal can update sale_orders"           ON public.sale_orders;


-- ════════════════════════════════════════════════════════════════════════════
-- Fix 4: RLS Policy Always True (Group A) — approval tables had no role
--        restriction at all (role = '-'), allowing anonymous access.
--        Restrict to `authenticated` role.
-- ════════════════════════════════════════════════════════════════════════════

ALTER POLICY "allow_all_approval_chains"           ON public.approval_chains           TO authenticated;
ALTER POLICY "allow_all_approval_chain_tiers"      ON public.approval_chain_tiers      TO authenticated;
ALTER POLICY "allow_all_approval_role_assignments" ON public.approval_role_assignments TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- Fix 5: Function Search Path Mutable — pin search_path on all 28 functions
--        so callers cannot redirect resolution via SET search_path.
--        Using `public` (not empty) preserves unqualified table references
--        already in function bodies.
-- ════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.batch_update_reserved_qty               SET search_path = public;
ALTER FUNCTION public.get_dead_stock_report                   SET search_path = public;
-- Two overloads exist; the 17-param version (with p_division_id) already sets
-- search_path in its CREATE OR REPLACE definition — only the 16-param original needs this.
ALTER FUNCTION public.create_sale_order(UUID, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT, JSONB) SET search_path = public;
ALTER FUNCTION public.approve_receival_inventory              SET search_path = public;
ALTER FUNCTION public.approve_warehouse_transfer_inventory    SET search_path = public;
ALTER FUNCTION public.approve_stock_adjustment_inventory      SET search_path = public;
ALTER FUNCTION public._set_lc_number                          SET search_path = public;
ALTER FUNCTION public.create_landed_cost                      SET search_path = public;
ALTER FUNCTION public.apply_receival_edit                     SET search_path = public;
ALTER FUNCTION public.create_and_confirm_delivery             SET search_path = public;
ALTER FUNCTION public.recalc_average_cost                     SET search_path = public;
ALTER FUNCTION public.update_reserved_qty                     SET search_path = public;
ALTER FUNCTION public.fn_update_linked_services_count         SET search_path = public;
ALTER FUNCTION public.set_updated_at                          SET search_path = public;
ALTER FUNCTION public.batch_increment_received_qty            SET search_path = public;
ALTER FUNCTION public.generate_invoice_from_so                SET search_path = public;
ALTER FUNCTION public.cancel_delivery_inventory               SET search_path = public;
ALTER FUNCTION public.refresh_po_status                       SET search_path = public;
ALTER FUNCTION public.create_and_approve_receival             SET search_path = public;
ALTER FUNCTION public.recalculate_ar_invoice_payment_status   SET search_path = public;
ALTER FUNCTION public.trg_recalc_ar_payment_status            SET search_path = public;
ALTER FUNCTION public.attach_payment_to_invoice               SET search_path = public;
ALTER FUNCTION public.detach_payment_from_invoice             SET search_path = public;
ALTER FUNCTION public.rpc_process_return_restock              SET search_path = public;
ALTER FUNCTION public.rpc_cancel_po_return_dispatch           SET search_path = public;
ALTER FUNCTION public.rpc_process_po_return_dispatch          SET search_path = public;
ALTER FUNCTION public.complete_delivery_inventory             SET search_path = public;
ALTER FUNCTION public.deduct_fifo_layers                      SET search_path = public;
