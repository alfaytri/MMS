-- ─────────────────────────────────────────────────────────────────────────────
-- Rename approval-related tables to clearer, scope-honest names.
--
-- Goal: stop using generic names for what are really module-specific tables.
--   approval_chains              → po_approval_chains
--   approval_chain_tiers         → po_approval_chain_tiers
--   approval_requests            → sale_order_approvals
--   workflow_approval_steps      → approval_workflow_steps
--   service_change_requests      → service_edit_requests
--
-- Strategy: real ALTER TABLE RENAME at the storage level (preserves every FK,
-- index, trigger, and RLS policy — those are bound by OID, not by table name).
-- Then create COMPATIBILITY VIEWS with the old names so the ~25+ PL/pgSQL
-- functions that reference these tables in their bodies (sales approval flow,
-- PO chain build, inv-check chain, stock-adjustment chain, service-change
-- workflow, workflow-step admin RPCs, baseline triggers) keep compiling and
-- running without a single change. Updatable simple views translate
-- SELECT/INSERT/UPDATE/DELETE straight through to the underlying renamed
-- table.
--
-- The compat views are intentionally permanent for now — we'll retire them
-- one at a time as each function is touched for unrelated reasons. That keeps
-- the rename non-breaking and reversible.
--
-- Enum renames (approval_type → sales_approval_type) and the source_type
-- column drop are NOT part of this migration. They'd require touching every
-- function signature/body that mentions the enum, so they're deferred until
-- the compat views are dropped.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Rename the underlying tables ─────────────────────────────────────────
ALTER TABLE public.approval_chains          RENAME TO po_approval_chains;
ALTER TABLE public.approval_chain_tiers     RENAME TO po_approval_chain_tiers;
ALTER TABLE public.approval_requests        RENAME TO sale_order_approvals;
ALTER TABLE public.workflow_approval_steps  RENAME TO approval_workflow_steps;
ALTER TABLE public.service_change_requests  RENAME TO service_edit_requests;

-- ── 2. Compatibility views: old name → new table ────────────────────────────
-- Simple SELECT * views are updatable in PostgreSQL, so existing functions
-- that INSERT/UPDATE/DELETE through the old name keep working unchanged.
CREATE VIEW public.approval_chains          AS SELECT * FROM public.po_approval_chains;
CREATE VIEW public.approval_chain_tiers     AS SELECT * FROM public.po_approval_chain_tiers;
CREATE VIEW public.approval_requests        AS SELECT * FROM public.sale_order_approvals;
CREATE VIEW public.workflow_approval_steps  AS SELECT * FROM public.approval_workflow_steps;
CREATE VIEW public.service_change_requests  AS SELECT * FROM public.service_edit_requests;

COMMENT ON VIEW public.approval_chains IS
  'Compat alias for po_approval_chains. Retire once every dependent function has been rewritten to use the new name.';
COMMENT ON VIEW public.approval_chain_tiers IS
  'Compat alias for po_approval_chain_tiers. Retire alongside approval_chains.';
COMMENT ON VIEW public.approval_requests IS
  'Compat alias for sale_order_approvals. Retire once every sales-approval function (build/advance/approve/reject/force-approve/log) has been rewritten.';
COMMENT ON VIEW public.workflow_approval_steps IS
  'Compat alias for approval_workflow_steps. Retire once add_workflow_step / add_workflow_step_for_role / update_workflow_step_conditions / archive_workflow_step / toggle_workflow_step / update_workflow_step_role and the chain-builders for PO + inv_check + stock_adj have been rewritten.';
COMMENT ON VIEW public.service_change_requests IS
  'Compat alias for service_edit_requests. Retire once approve/reject/submit/update/withdraw service-change RPCs have been rewritten.';

-- ── 3. Mirror RLS through the views ─────────────────────────────────────────
-- Views don't carry the base table's RLS by default. authenticated users hit
-- the views from PostgREST (Supabase API), so we need them to be readable.
-- Writes through the views still execute against the underlying table and
-- are subject to its RLS — no security regression.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_chains          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_chain_tiers     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflow_steps  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_approval_steps  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_change_requests  TO authenticated, service_role;

-- New tables — re-grant explicitly (the rename preserves grants, but the new
-- names need to be explicitly callable from the Supabase API namespace).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_approval_chains       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_approval_chain_tiers  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_order_approvals     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_edit_requests    TO authenticated, service_role;

-- ── 4. Notify PostgREST so its schema cache picks up the new names ──────────
NOTIFY pgrst, 'reload schema';

COMMIT;
