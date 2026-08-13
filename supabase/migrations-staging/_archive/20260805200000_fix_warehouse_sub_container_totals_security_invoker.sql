-- Fix the Supabase database-linter ERROR (0010_security_definer_view).
-- The view was created with security_invoker=false, which makes it run
-- with the creator's privileges and bypass RLS on the underlying tables.
-- Flip it to security_invoker=true so callers see only rows their RLS
-- policies on warehouse_sub_containers / fifo_cost_layers permit.
ALTER VIEW public.warehouse_sub_container_totals SET (security_invoker = true);
