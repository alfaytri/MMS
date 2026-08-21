-- Stage 4 (post-smoke enhancement): partial warranty claims + remaining-coverage
-- tracking. Operator smoke of Stage 3 found: a warranty covers the full delivered
-- qty (e.g. 10 units) but a claim returned the whole batch, and there was no way
-- to see whether a warranty still had coverage left. Decisions (operator):
--   - Partial claims WITH remaining tracking: each claim names a qty; the warranty
--     stays valid for the un-claimed units; multiple claims allowed until coverage
--     is exhausted or (future) expiry.
--   - Consumption rule: void + rejected claims RELEASE their qty back to remaining;
--     open/covered/in_progress/resolved HOLD it. So rejecting frees the units to be
--     re-claimed for a different defect, and voiding a mistaken claim restores it.
--
-- Live-verified (2026-08-22, staging): warranty_records.qty + return_lines.qty are
-- both integer NOT NULL; rpc_file_warranty_claim was (uuid,text) — adding p_claim_qty
-- changes the signature, so the old overload is DROP'd first (not CREATE OR REPLACE).

BEGIN;

-- 1. claim_qty column ------------------------------------------------------------
ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS claim_qty integer;

-- Backfill existing rows to their warranty record's full qty (pre-partial-qty
-- behaviour = whole batch), so the NOT NULL below is satisfiable.
UPDATE public.warranty_claims c
   SET claim_qty = wr.qty
  FROM public.warranty_records wr
 WHERE wr.id = c.warranty_record_id
   AND c.claim_qty IS NULL;

ALTER TABLE public.warranty_claims
  ALTER COLUMN claim_qty SET NOT NULL;

ALTER TABLE public.warranty_claims
  DROP CONSTRAINT IF EXISTS warranty_claims_claim_qty_positive;
ALTER TABLE public.warranty_claims
  ADD CONSTRAINT warranty_claims_claim_qty_positive CHECK (claim_qty > 0);

-- 2. Remaining-coverage view -----------------------------------------------------
-- security_invoker=true so the caller's RLS on warranty_records (is_division_visible)
-- and warranty_claims still applies — the view adds no new visibility. remaining_qty
-- = record qty minus the qty held by non-terminated claims (void/rejected release).
DROP VIEW IF EXISTS public.warranty_records_remaining;
CREATE VIEW public.warranty_records_remaining
  WITH (security_invoker = true) AS
SELECT
  wr.*,
  GREATEST(
    wr.qty - COALESCE((
      SELECT SUM(c.claim_qty)
        FROM public.warranty_claims c
       WHERE c.warranty_record_id = wr.id
         AND c.status NOT IN ('void','rejected')
    ), 0),
    0
  )::integer AS remaining_qty
FROM public.warranty_records wr;

REVOKE ALL ON public.warranty_records_remaining FROM PUBLIC, anon;
GRANT SELECT ON public.warranty_records_remaining TO authenticated;

-- 3. rpc_file_warranty_claim — now takes p_claim_qty, guards against over-claiming --
-- Signature change (uuid,text) -> (uuid,text,integer): drop the old overload so we
-- don't leave two callable versions.
DROP FUNCTION IF EXISTS public.rpc_file_warranty_claim(uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_file_warranty_claim(
  p_warranty_record_id uuid,
  p_issue text,
  p_claim_qty integer
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_profile   uuid;
  v_rec       RECORD;
  v_remaining integer;
  v_id        uuid;
BEGIN
  SELECT id INTO v_profile FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;

  -- Lock the record so concurrent files can't both pass the remaining check.
  SELECT id, source_type, division_id, qty INTO v_rec
    FROM warranty_records WHERE id = p_warranty_record_id FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

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
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_file_warranty_claim(uuid, text, integer) TO authenticated;

-- 4. rpc_start_warranty_claim_resolution — return uses the CLAIM's qty, not the ----
--    warranty record's full qty (so a partial claim returns only its units).
CREATE OR REPLACE FUNCTION public.rpc_start_warranty_claim_resolution(p_claim_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_profile      uuid;
  v_profile_name text;
  v_claim        RECORD;
  v_rec          RECORD;
  v_delivery_id  uuid;
  v_return_number text;
  v_return_id     uuid;
BEGIN
  SELECT id, full_name INTO v_profile, v_profile_name FROM user_data WHERE auth_user_id = auth.uid();
  IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
    RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
  END IF;

  SELECT id, claim_number, status, warranty_type, warranty_record_id, division_id, claim_qty
    INTO v_claim
    FROM warranty_claims
    WHERE id = p_claim_id
    FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF v_claim.warranty_type <> 'sale' THEN
    RAISE EXCEPTION 'service/contract warranty resolution is not built yet' USING ERRCODE='0A000';
  END IF;
  IF v_claim.status <> 'covered' THEN
    RAISE EXCEPTION 'Only a covered claim can start resolution (status: %)', v_claim.status USING ERRCODE='42501';
  END IF;

  SELECT id, sale_order_id, sale_delivery_line_id, brand_variant_id, item_name, sku
    INTO v_rec
    FROM warranty_records
    WHERE id = v_claim.warranty_record_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

  SELECT sale_delivery_id INTO v_delivery_id
    FROM sale_delivery_lines
    WHERE id = v_rec.sale_delivery_line_id;

  -- Replicate useCreateSaleReturn's return-number scheme (count of existing
  -- source_type='sale_order' returns + 1 -> 'SR-#####'), serialized with an
  -- advisory lock since this runs server-side and must not race.
  PERFORM pg_advisory_xact_lock(hashtext('so_po_returns_return_number'));
  SELECT 'SR-' || lpad((count(*) + 1)::text, 5, '0')
    INTO v_return_number
    FROM so_po_returns
    WHERE source_type = 'sale_order';

  INSERT INTO so_po_returns (
    return_number, source_type, source_id, source_delivery_id,
    reason, status, division_id, warranty_claim_id,
    created_by, created_by_name
  ) VALUES (
    v_return_number, 'sale_order', v_rec.sale_order_id, v_delivery_id,
    'Warranty claim ' || v_claim.claim_number, 'pending_inspection', v_claim.division_id, p_claim_id,
    v_profile, v_profile_name
  )
  RETURNING id INTO v_return_id;

  -- Return line carries the CLAIM quantity (partial claim -> partial return).
  INSERT INTO return_lines (
    return_id, brand_variant_id, item_name, sku, qty, condition, sale_delivery_line_id
  ) VALUES (
    v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_claim.claim_qty, 'inspection', v_rec.sale_delivery_line_id
  );

  UPDATE warranty_claims
    SET status = 'in_progress', linked_return_id = v_return_id, updated_at = now()
    WHERE id = p_claim_id;

  RETURN v_return_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rpc_start_warranty_claim_resolution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_start_warranty_claim_resolution(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
