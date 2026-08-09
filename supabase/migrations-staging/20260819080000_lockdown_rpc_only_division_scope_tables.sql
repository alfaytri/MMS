-- Security remediation P0b — revoke client write grants on the RPC-only
-- division_scope tables.
--
-- Finding (2026-08-09): the app-wide `division_scope_{select,insert,update,delete}`
-- RLS pattern gates writes ONLY on is_division_visible(division_id) — not on
-- columns, row state, or role. So any authenticated division member could craft a
-- raw PostgREST write (`supabase.from(t).update({...})`) and tamper with money-path
-- rows (amounts, allocations, COGS) on any row in a division they can see.
--
-- These 7 tables have NO direct client writes (verified via a full `src/` audit
-- 2026-08-09 — every INSERT/UPDATE/DELETE goes through a SECURITY DEFINER RPC).
-- Writer-function security modes were checked live: all functions that write these
-- tables are prosecdef=true (DEFINER) EXCEPT bill_line_items_invalidate_parent_pdf_fn,
-- which is an AFTER trigger on bill_line_items that only nulls the parent bill's
-- pdf_url — and since bill_line_items is itself only ever written by DEFINER RPCs,
-- that trigger only fires inside DEFINER context and runs as the table owner. So a
-- DEFINER RPC (which bypasses grants + RLS) keeps working; only the direct-PostgREST
-- tampering vector is removed.
--
-- SELECT is retained — the app reads all of these directly (PDF joins, aging
-- drilldowns, list views). anon keeps nothing (the app is authenticated-only; anon
-- has no legitimate access to these tables).
--
-- The existing division_scope INSERT/UPDATE/DELETE RLS policies are left in place as
-- moot defense-in-depth — with the grant revoked, PostgREST rejects the write before
-- RLS is even evaluated.
--
-- Full audit + prioritized plan:
--   docs/security/2026-08-09-division-scope-rls-audit-remediation.md
-- REVOKE is idempotent (revoking an absent privilege is a no-op).

-- bills
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bills                    FROM authenticated;
REVOKE ALL                                ON public.bills                    FROM anon;
-- bill_line_items
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bill_line_items          FROM authenticated;
REVOKE ALL                                ON public.bill_line_items          FROM anon;
-- invoice_line_items
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoice_line_items       FROM authenticated;
REVOKE ALL                                ON public.invoice_line_items       FROM anon;
-- payment_bill_allocations
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_bill_allocations FROM authenticated;
REVOKE ALL                                ON public.payment_bill_allocations FROM anon;
-- sale_order_lines
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sale_order_lines         FROM authenticated;
REVOKE ALL                                ON public.sale_order_lines         FROM anon;
-- cogs_entries
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cogs_entries             FROM authenticated;
REVOKE ALL                                ON public.cogs_entries             FROM anon;
-- consumption_entries
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.consumption_entries      FROM authenticated;
REVOKE ALL                                ON public.consumption_entries      FROM anon;
