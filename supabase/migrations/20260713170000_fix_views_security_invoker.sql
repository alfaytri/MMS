-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: warehouse_stock_view missing security_invoker = true
--
-- Without security_invoker, the view runs as the view owner (postgres),
-- bypassing RLS on the underlying tables (fifo_cost_layers,
-- inventory_brand_variants, inventory_items, inventory_categories,
-- warehouse_stock_allocations).
--
-- The 5 compatibility views from the rename migration (approval_chains,
-- approval_chain_tiers, approval_requests, workflow_approval_steps,
-- service_change_requests) were already dropped in migration 20260627114000.
-- The 2 divisions compat views were dropped in 20260627116000.
-- customer_credit_summary was fixed in 20260713165620.
--
-- This leaves warehouse_stock_view as the only remaining view without
-- security_invoker.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER VIEW public.warehouse_stock_view SET (security_invoker = true);
