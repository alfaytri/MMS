-- Hardening migration — close the anon (publishable-key) exposure found in the
-- 2026-08-26 production DB audit. Findings C1–C3.
-- Report: docs/DB Audits/2026-08-26-prod-db-audit.md
--
-- Verified before authoring (2026-08-26): staging (mwvblpgbgxipvrevkeff) and new-prod
-- (optishfnnctrhffpoywg) are IDENTICAL for every object touched here (same policy names,
-- same {public} roles, same empty reloptions, warranty_claim_counters RLS OFF on both).
-- Every write path for the affected tables is a SECURITY DEFINER function (which bypasses
-- RLS), so these changes remove anon/public reach WITHOUT breaking any application flow:
--   landed_cost_item_allocations  <- allocate_landed_cost, revert_landed_cost (DEFINER)
--   landed_cost_lines             <- create_landed_cost (DEFINER)
--   sale_delivery_lines           <- create_and_confirm_delivery, rpc_complete_delivery_with_followup,
--                                    rpc_create_partial_replacement (DEFINER)
--   notifications                 <- check_low_stock_and_notify, po_approval_action, ... (all DEFINER)
--   warranty_claim_counters       <- next_warranty_claim_number (DEFINER)
--
-- Idempotent: ALTER VIEW SET / ENABLE RLS / REVOKE / ALTER POLICY ... TO are all no-ops
-- when the target state already holds, so this file is safe to re-run.

-- =====================================================================
-- C1 — warehouse_sub_container_totals: the view ran with security_invoker=false, so it
--   bypassed RLS on its base tables and returned all rows to anon (confirmed: anon read
--   53 rows via the view while the base table warehouse_sub_containers correctly returned 0).
--   Root cause of the regression: 20260805200000 set security_invoker=true, but the later
--   20261007000000 `CREATE OR REPLACE VIEW` (to add division columns) reset the view's
--   reloptions — CREATE OR REPLACE does NOT preserve them — silently re-opening the hole.
--   Re-apply security_invoker so the view honours the CALLER's RLS on
--   warehouse_sub_containers / fifo_cost_layers, and drop the (unnecessary) anon grant.
--
--   !!! FUTURE EDITORS: any CREATE OR REPLACE of this view MUST re-set
--       security_invoker=true (or ALTER VIEW ... SET afterwards) or this hole reopens. !!!
-- =====================================================================
ALTER VIEW public.warehouse_sub_container_totals SET (security_invoker = true);
REVOKE ALL ON public.warehouse_sub_container_totals FROM anon;

-- =====================================================================
-- C2 — warranty_claim_counters: the only public table with RLS DISABLED, while anon still
--   held full table privileges — so anon could read and write the warranty-claim numbering
--   counter (integrity risk). Its sole writer, next_warranty_claim_number(), is SECURITY
--   DEFINER and bypasses RLS, so enabling RLS with NO policy (deny-all to anon/authenticated,
--   reachable only via the DEFINER RPC / service_role) is safe and mirrors the proven sibling
--   pattern of consumption_number_counters (RLS on, 0 policies).
-- =====================================================================
ALTER TABLE public.warranty_claim_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warranty_claim_counters FROM anon;

-- =====================================================================
-- C3 — four tables carried permissive {public} USING(true) policies with NO restrictive
--   division backstop, so anon could read and write them (notifications already exposed 31
--   rows to anon; the landed-cost / sale-delivery tables were empty but wide open). Because
--   the `public` role includes anon, restricting these policies to `authenticated` and
--   revoking the anon table grants removes anon reach. All writes go through SECURITY DEFINER
--   RPCs (listed above), so no application write path is affected.
--
--   Deliberately NOT in this hotfix (tracked as P1 follow-ups so this stays low-risk):
--     * sale_delivery_lines — add division-scope RESTRICTIVE parity to match its parent
--       sale_deliveries (which is division-scoped); until then any authenticated user can
--       still read all delivery lines.
--     * notifications — add per-recipient scoping via profile_id so authenticated users
--       cannot read each other's notifications.
-- =====================================================================
ALTER POLICY landed_cost_lines_read       ON public.landed_cost_lines            TO authenticated;
ALTER POLICY landed_cost_lines_write      ON public.landed_cost_lines            TO authenticated;
ALTER POLICY landed_cost_item_alloc_read  ON public.landed_cost_item_allocations TO authenticated;
ALTER POLICY landed_cost_item_alloc_write ON public.landed_cost_item_allocations TO authenticated;
ALTER POLICY sale_delivery_lines_read     ON public.sale_delivery_lines          TO authenticated;
ALTER POLICY sale_delivery_lines_write    ON public.sale_delivery_lines          TO authenticated;
ALTER POLICY allow_all_notifications      ON public.notifications                TO authenticated;

REVOKE ALL ON public.landed_cost_lines,
              public.landed_cost_item_allocations,
              public.sale_delivery_lines,
              public.notifications
  FROM anon;
