-- Wave 3 of the Supabase performance cleanup.
--
-- (a) Consolidate 9 tables flagged by lint 0006_multiple_permissive_policies.
--     Each table has two permissive policies firing on the same role+action.
--     For 7 of them the bodies are identical (both USING(true)) so the redundant
--     read-only policy is dropped; the remaining FOR ALL policy continues to
--     cover SELECT/INSERT/UPDATE/DELETE. For service_brands and invoices the
--     bodies differ — those merges preserve original semantics, see comments.
--
-- (b) Switch warehouse_stock_view from SECURITY DEFINER to SECURITY INVOKER
--     (lint 0010_security_definer_view). All underlying tables already have
--     `USING (true)` policies for authenticated users, so the switch doesn't
--     change what authenticated callers can read.

------------------------------------------------------------------------------
-- 1-7. Tables with identical USING(true) on both policies: drop the FOR SELECT
--      duplicate. The remaining FOR ALL policy covers reads.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read employee_services" ON public.employee_services;
DROP POLICY IF EXISTS "Authenticated users can read installed_products" ON public.installed_products;
DROP POLICY IF EXISTS "Authenticated users can read tool_assignments"   ON public.tool_assignments;
DROP POLICY IF EXISTS internal_select_service_customer_addresses        ON public.service_customer_addresses;
DROP POLICY IF EXISTS internal_select_service_customer_phones           ON public.service_customer_phones;
DROP POLICY IF EXISTS internal_select_service_customers                 ON public.service_customers;
DROP POLICY IF EXISTS service_instructions_read                         ON public.service_instructions;

------------------------------------------------------------------------------
-- 8. service_brands — the read policy permits all authenticated SELECT
--    (USING true), while the manage policy is FOR ALL with a restrictive role
--    check. Postgres fires BOTH on SELECT (the lint warning). Splitting the
--    manage FOR ALL into per-action INSERT/UPDATE/DELETE policies removes it
--    from SELECT evaluation while preserving write gating semantics.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage services write service_brands" ON public.service_brands;

CREATE POLICY "Manage services insert service_brands"
  ON public.service_brands FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  );

CREATE POLICY "Manage services update service_brands"
  ON public.service_brands FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  );

CREATE POLICY "Manage services delete service_brands"
  ON public.service_brands FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  );

------------------------------------------------------------------------------
-- 9. invoices — two UPDATE policies. Original behaviour (combined permissive):
--      USING:  true (non-void policy + void policy combined)
--      CHECK:  new.status != 'void' OR (new.status = 'void' AND admin)
--    Single merged policy below replicates this exactly with one evaluation
--    per row instead of two.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Accounting/admin can void invoices"        ON public.invoices;
DROP POLICY IF EXISTS "Authenticated can update invoices (non-void)" ON public.invoices;

CREATE POLICY "Authenticated can update invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    status IS DISTINCT FROM 'void'::public.invoice_status
    OR (
      status = 'void'::public.invoice_status
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
        JOIN public.custom_roles cr ON cr.id = ucr.role_id
        WHERE p.auth_user_id = (SELECT auth.uid())
          AND cr.deleted_at IS NULL
          AND (cr.is_system = true OR 'invoices.manage' = ANY(cr.permissions))
      )
    )
  );

------------------------------------------------------------------------------
-- 10. warehouse_stock_view — SECURITY DEFINER → SECURITY INVOKER.
--     Underlying tables (fifo_cost_layers, inventory_brand_variants,
--     inventory_items, inventory_categories, warehouse_stock_allocations)
--     all permit authenticated SELECT via USING(true) policies, so switching
--     to invoker semantics doesn't change what callers can read.
------------------------------------------------------------------------------
ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
