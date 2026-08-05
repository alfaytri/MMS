-- Security cleanup: flip 3 progress views to security_invoker.
--
-- Supabase Advisors flagged these during storage-audit 3C smoke:
--   • public.sale_order_lines_summary   — reads sale_deliveries + return_lines
--   • public.return_line_progress       — reads return_lines + resolutions
--   • public.return_progress            — reads so_po_returns + return_lines
--
-- All three were created without an explicit `security_invoker`, so they
-- default to owner-runs (postgres, superuser) and BYPASS the division-scope
-- RLS on their underlying tables. A user could hit `/rest/v1/<view>` with
-- an arbitrary sale_order_id / return_id and read another division's data.
--
-- The UI never asks these views for cross-division rows — every call is
-- filtered by a sale_order_id / return_id the user already got via a
-- RLS-filtered list query. Setting security_invoker = true keeps that
-- flow working (underlying tables use `is_division_visible(division_id)`
-- and a sale_delivery/return_line inherits its parent's division, so
-- aggregates stay complete for the user's own SOs) while blocking the
-- cross-division read path.
--
-- `public.warehouse_sub_container_totals` is intentionally left definer
-- (owner-runs) — see 20260801200100_warehouse_sub_container_totals_bypass_rls.sql
-- for the rationale: the landing card must show every sub-container that
-- physically holds stock in a warehouse, not just those in the user's
-- active division.

BEGIN;

ALTER VIEW public.sale_order_lines_summary SET (security_invoker = true);
ALTER VIEW public.return_line_progress    SET (security_invoker = true);
ALTER VIEW public.return_progress         SET (security_invoker = true);

COMMIT;
