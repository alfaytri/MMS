-- ─────────────────────────────────────────────────────────────────────────────
-- The five compatibility views added in 20260627112000 (approval_chains,
-- approval_chain_tiers, approval_requests, workflow_approval_steps,
-- service_change_requests) shipped without security_invoker, so they ran as
-- the view owner (postgres) and bypassed the underlying table's RLS. Supabase
-- Studio flagged this with an "UNRESTRICTED" badge.
--
-- Setting security_invoker=true makes each view execute as the calling user,
-- which means SELECT/INSERT/UPDATE/DELETE through the old-name view enforce
-- the SAME RLS policies that protect the renamed underlying table. The badge
-- goes away and the safety net is no longer a security hole.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER VIEW public.approval_chains          SET (security_invoker = true);
ALTER VIEW public.approval_chain_tiers     SET (security_invoker = true);
ALTER VIEW public.approval_requests        SET (security_invoker = true);
ALTER VIEW public.workflow_approval_steps  SET (security_invoker = true);
ALTER VIEW public.service_change_requests  SET (security_invoker = true);

COMMIT;
