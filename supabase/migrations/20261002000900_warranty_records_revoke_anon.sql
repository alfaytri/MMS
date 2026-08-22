-- Stage 4 hardening (review [Note]): warranty_records is a back-office table
-- (no public/customer-facing surface in this build), but it still granted SELECT
-- to the `anon` role — an inconsistency with the rest of the warranty module
-- (warranty_claims, and the warranty_records_remaining view, grant only to
-- `authenticated`). RLS (is_division_visible) already returns zero rows to anon,
-- so nothing leaked; this removes the grant so the table is not reachable by the
-- anon role at all (defense in depth). The app reads warranty_records as the
-- `authenticated` role (logged-in users) — unaffected.
--
-- Live-verified (2026-08-22): warranty_records had anon SELECT=true; warranty_claims
-- had anon SELECT=false. This aligns them.

BEGIN;

REVOKE ALL ON public.warranty_records FROM anon;

COMMIT;
