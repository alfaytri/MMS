-- Security P1 — revoke client UPDATE/DELETE on payment_plans (no guard trigger).
--
-- Finding: payment_plans has exactly ONE direct client write — the INSERT in
-- useCreatePaymentPlan (usePaymentPlans.ts, plan at status='active'). There is NO
-- client UPDATE or DELETE anywhere. status->'completed' is set only by the DEFINER
-- rpc_settle_installment. The table still carried the baseline "Internal users can
-- manage payment_plans" USING(true)/WITH CHECK(true) policy — fully open to
-- authenticated (and anon). Because no legit client UPDATE/DELETE exists, the cleanest
-- fix is a P0-style revoke rather than a guard trigger.
--
-- Verified live before writing (staging mwvblpgbgxipvrevkeff, 2026-08-10,
-- `npx supabase db query --linked`):
--  * NO src/ direct client .update()/.delete() on payment_plans (grep = no matches);
--    the sole client write is the INSERT (kept).
--  * every payment_plans UPDATE/DELETE writer is prosecdef=true (DEFINER) — e.g.
--    rpc_settle_installment, rpc_edit_*/rpc_delete_* payment — so they run as the
--    owner role and are UNAFFECTED by revoking authenticated's UPDATE/DELETE.
--  * before: authenticated + anon both held full CRUD.

REVOKE UPDATE, DELETE ON public.payment_plans FROM authenticated;
REVOKE ALL ON public.payment_plans FROM anon;
-- INSERT + SELECT intentionally retained for authenticated (useCreatePaymentPlan).
