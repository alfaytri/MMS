-- Stage 3 Task 3: warranty_claims lifecycle RPCs (file / assess / void).
-- Plan: docs/plans/2026-08-21-warranty-completion/03-claims.md
-- "Task 3: Claim RPCs — file / assess / void (self-contained)".
--
-- Filename note: the plan text names this file 20261002000300, but that
-- timestamp was already claimed by the Stage-3 Task-1 schema migration
-- (20261002000300_warranty_claims_schema.sql, already applied to staging).
-- Using 20261002000400 instead so ordering stays correct.
--
-- Live-verified before writing (2026-08-21, staging mwvblpgbgxipvrevkeff via
-- `supabase db query --linked`) — plan's SQL matched live reality with ONE
-- deliberate deviation (permission-helper call style, see below):
--   - Two permission-helper overloads exist: `_auth_user_has_permission(p_permission text)`
--     and `_user_has_permission(p_profile_id uuid, p_permission text)`. The
--     plan calls the latter positionally; here it is called with NAMED
--     parameters (`p_profile_id := v_profile, p_permission := '...'`) using
--     the exact live parameter names, so a param-order mismatch can't bite.
--     v_profile is still needed for this function's own audit columns
--     (reported_by/decided_by/voided_by), so resolving the profile once and
--     using `_user_has_permission` (rather than `_auth_user_has_permission`,
--     which derives the profile internally and wouldn't hand it back) is the
--     correct fit.
--   - public.warranty_claims columns (claim_number, warranty_record_id,
--     warranty_type, status, issue_description, reported_by, division_id,
--     decision, decided_by, decided_at, decision_reason, void_reason,
--     voided_by, voided_at) match the plan's Task-1 schema exactly.
--   - public.warranty_claim_status enum labels confirmed live: open, covered,
--     rejected, in_progress, resolved, void (matches plan + status guards
--     below).
--   - public.next_warranty_claim_number(p_division_id uuid) returns text —
--     matches the plan's call in rpc_file_warranty_claim.
--   - public.warranty_records has columns id, source_type, division_id
--     (plus Stage-2 origin columns, unrelated to this task) — matches the
--     plan's SELECT in rpc_file_warranty_claim.
--   - public.user_data has columns id, auth_user_id — matches the plan's
--     profile-resolution SELECT.
--   - No pre-existing rpc_file_warranty_claim / rpc_assess_warranty_claim /
--     rpc_void_warranty_claim in pg_proc — clean create, no overload
--     collisions.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_file_warranty_claim(p_warranty_record_id uuid, p_issue text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_rec RECORD; v_id uuid;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  SELECT id, source_type, division_id INTO v_rec FROM warranty_records WHERE id = p_warranty_record_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'Issue description is required'; END IF;
  INSERT INTO warranty_claims(claim_number, warranty_record_id, warranty_type, status, issue_description, reported_by, division_id)
  VALUES (public.next_warranty_claim_number(v_rec.division_id), v_rec.id, v_rec.source_type, 'open', btrim(p_issue), v_profile, v_rec.division_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rpc_assess_warranty_claim(p_claim_id uuid, p_decision text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_status warranty_claim_status;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('covered','rejected') THEN RAISE EXCEPTION 'decision must be covered or rejected'; END IF;
  SELECT status INTO v_status FROM warranty_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Only an open claim can be assessed (status: %)', v_status USING ERRCODE='42501'; END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE warranty_claims
    SET decision = p_decision, decided_by = v_profile, decided_at = now(), decision_reason = NULLIF(btrim(p_reason),''),
        status = CASE WHEN p_decision = 'covered' THEN 'covered'::warranty_claim_status ELSE 'rejected'::warranty_claim_status END,
        updated_at = now()
    WHERE id = p_claim_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rpc_void_warranty_claim(p_claim_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_profile uuid; v_status warranty_claim_status;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  SELECT status INTO v_status FROM warranty_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF v_status IN ('resolved','void') THEN RAISE EXCEPTION 'Claim is already %', v_status USING ERRCODE='42501'; END IF;
  UPDATE warranty_claims
    SET status = 'void', void_reason = btrim(p_reason), voided_by = v_profile, voided_at = now(), updated_at = now()
    WHERE id = p_claim_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid,text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_assess_warranty_claim(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid,text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid,text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_assess_warranty_claim(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_void_warranty_claim(uuid,text)    TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
