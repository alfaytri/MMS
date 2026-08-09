-- ============================================================================
-- DRAFT — NOT APPLIED. Review + run ../MORNING-CHECKLIST.md before shipping.
-- Copy to supabase/migrations/<ts>_revoke_payment_plans_client_writes.sql + mirror.
-- ============================================================================
-- Security P1 — revoke client UPDATE/DELETE on payment_plans (no guard trigger).
--
-- Finding (audit ../security-p1-audit.md §8): payment_plans has exactly ONE direct
-- client write — the INSERT in useCreatePaymentPlan (usePaymentPlans.ts:60, plan at
-- status='active'). There is NO client UPDATE or DELETE anywhere. status→'completed'
-- is set only by the DEFINER rpc_settle_installment (20260806260000:110). The table
-- still carries the baseline "Internal users can manage payment_plans" USING(true)
-- WITH CHECK(true) policy (untouched by 20260806000000) — fully open to authenticated.
--
-- Because no legit client UPDATE/DELETE exists, the cleanest fix is a P0-style revoke
-- rather than a guard trigger: keep INSERT + SELECT, drop UPDATE/DELETE. DEFINER RPCs
-- run as the owner role and are unaffected.
--
-- ⚠ MORNING PRE-CHECK: re-grep src/ for any .from('payment_plans').update(/.delete(
--   (audit found none) and confirm every writer RPC is prosecdef=true before revoking.

REVOKE UPDATE, DELETE ON public.payment_plans FROM authenticated;
REVOKE ALL ON public.payment_plans FROM anon;
-- INSERT + SELECT intentionally retained for authenticated (useCreatePaymentPlan).
