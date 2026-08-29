-- Consumption warranties: the three warranty-claim RPCs now pick the permission
-- key by the warranty record's source — consumption claims require
-- 'consumption.warranty_claims.manage', everything else (sale/service/contract)
-- keeps 'sales.warranty_claims.manage'. Bodies are the live functions verbatim
-- with the record/claim source resolved before the permission check and the
-- hard-coded check replaced by a source branch. CREATE OR REPLACE preserves the
-- existing ownership + grants.

CREATE OR REPLACE FUNCTION public.rpc_file_warranty_claim(p_warranty_record_id uuid, p_issue text, p_claim_qty integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile   uuid;
  v_rec       RECORD;
  v_remaining integer;
  v_id        uuid;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Lock the record so concurrent files can't both pass the remaining check.
  -- Loaded before the permission check so the key can be chosen by source.
  SELECT id, source_type, division_id, qty INTO v_rec
    FROM warranty_records WHERE id = p_warranty_record_id FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

  -- Source-aware permission: consumption warranties use the consumption key;
  -- everything else (sale/service/contract) keeps the sales key.
  IF v_rec.source_type = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'Issue description is required'; END IF;
  IF p_claim_qty IS NULL OR p_claim_qty < 1 THEN
    RAISE EXCEPTION 'Claim quantity must be at least 1';
  END IF;

  v_remaining := v_rec.qty - COALESCE((
    SELECT SUM(c.claim_qty) FROM warranty_claims c
     WHERE c.warranty_record_id = v_rec.id
       AND c.status NOT IN ('void','rejected')
  ), 0);

  IF p_claim_qty > v_remaining THEN
    RAISE EXCEPTION 'Only % unit(s) remain under this warranty (requested %)', v_remaining, p_claim_qty
      USING ERRCODE='23514';
  END IF;

  INSERT INTO warranty_claims(
    claim_number, warranty_record_id, warranty_type, status, issue_description,
    claim_qty, reported_by, division_id
  )
  VALUES (
    public.next_warranty_claim_number(v_rec.division_id), v_rec.id, v_rec.source_type, 'open', btrim(p_issue),
    p_claim_qty, v_profile, v_rec.division_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_assess_warranty_claim(p_claim_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_profile uuid; v_status warranty_claim_status; v_source text;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Load the claim (locked) + its warranty source so the permission key can be
  -- chosen by source.
  SELECT wc.status, wr.source_type INTO v_status, v_source
    FROM warranty_claims wc
    JOIN warranty_records wr ON wr.id = wc.warranty_record_id
    WHERE wc.id = p_claim_id
    FOR UPDATE OF wc;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_source = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_decision NOT IN ('covered','rejected') THEN RAISE EXCEPTION 'decision must be covered or rejected'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Only an open claim can be assessed (status: %)', v_status USING ERRCODE='42501'; END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE warranty_claims
    SET decision = p_decision, decided_by = v_profile, decided_at = now(), decision_reason = NULLIF(btrim(p_reason),''),
        status = CASE WHEN p_decision = 'covered' THEN 'covered'::warranty_claim_status ELSE 'rejected'::warranty_claim_status END,
        updated_at = now()
    WHERE id = p_claim_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_void_warranty_claim(p_claim_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile       uuid;
  v_status        warranty_claim_status;
  v_return_id     uuid;
  v_return_status return_status;
  v_source        text;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();

  -- Load the claim (locked) + its warranty source so the permission key can be
  -- chosen by source.
  SELECT wc.status, wc.linked_return_id, wr.source_type INTO v_status, v_return_id, v_source
    FROM warranty_claims wc
    JOIN warranty_records wr ON wr.id = wc.warranty_record_id
    WHERE wc.id = p_claim_id
    FOR UPDATE OF wc;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_source = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  END IF;

  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A void reason is required'; END IF;
  IF v_status IN ('resolved','void') THEN RAISE EXCEPTION 'Claim is already %', v_status USING ERRCODE='42501'; END IF;

  -- in_progress claim: reconcile its linked return so voiding can't orphan a live
  -- return (which would double-count the units against released coverage).
  IF v_status = 'in_progress' AND v_return_id IS NOT NULL THEN
    SELECT status INTO v_return_status FROM so_po_returns WHERE id = v_return_id FOR UPDATE;
    IF v_return_status IS DISTINCT FROM 'pending_inspection' THEN
      RAISE EXCEPTION 'This claim''s return has already been processed (status: %). Resolve or complete that return instead of voiding the claim.', v_return_status
        USING ERRCODE='42501';
    END IF;
    UPDATE so_po_returns SET status = 'cancelled', updated_at = now() WHERE id = v_return_id;
  END IF;

  UPDATE warranty_claims
    SET status = 'void', void_reason = btrim(p_reason), voided_by = v_profile, voided_at = now(), updated_at = now()
    WHERE id = p_claim_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
