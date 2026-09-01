-- 20260831002100_consumption_warranty_claim_return_p4.sql
-- Consumption warranty claims → consumption returns (Phase 4). Spec:
-- docs/plans/2026-08-29-consumption-sales-returns-warranty-design.md §4/§9.
-- Requires Phase 3b (consumption returns, 20260831001900/002000).
--
-- Resolving a COVERED warranty claim builds a return the claimed item flows
-- back through. Until now that only handled sale-sourced warranties (built a
-- sales return); a consumption-sourced warranty (Phase 2) was rejected. Phase 4
-- branches the resolution by warranty source:
--   * sale        → sales return   (unchanged, verbatim)
--   * consumption → consumption return (source_type='consumption', links the
--                   consumption_line via return_lines.consumption_line_id), then
--                   flows through the Phase-3b machinery (inspection → good
--                   restock / damaged dispositions, reversing consumption COGS).
--
-- Also patches rpc_complete_return_inspection: it created the good/damaged split
-- lines carrying only sale_delivery_line_id / receival_item_id — for a
-- consumption inspection line that left consumption_line_id NULL and the
-- provenance trigger rejected the split. It now carries consumption_line_id too,
-- and its permission gate accepts consumption.returns.* .
--
-- Live bodies fetched via pg_get_functiondef before editing.
BEGIN;

-- ─── 1. Warranty claim resolution → return, branched by source ────────────
CREATE OR REPLACE FUNCTION public.rpc_start_warranty_claim_resolution(p_claim_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile      uuid;
  v_profile_name text;
  v_claim        RECORD;
  v_rec          RECORD;
  v_delivery_id  uuid;
  v_division     uuid;
  v_return_number text;
  v_return_id     uuid;
BEGIN
  SELECT id, full_name INTO v_profile, v_profile_name FROM user_data WHERE auth_user_id = auth.uid();

  SELECT id, claim_number, status, warranty_type, warranty_record_id, division_id, claim_qty
    INTO v_claim
    FROM warranty_claims
    WHERE id = p_claim_id
    FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;

  -- Permission by source: consumption claims use the consumption key (Phase 4);
  -- sale claims keep the sales key. Service / contract not built yet.
  IF v_claim.warranty_type = 'consumption' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'consumption.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: consumption.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSIF v_claim.warranty_type = 'sale' THEN
    IF NOT public._user_has_permission(p_profile_id := v_profile, p_permission := 'sales.warranty_claims.manage') THEN
      RAISE EXCEPTION 'Missing permission: sales.warranty_claims.manage' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'service/contract warranty resolution is not built yet' USING ERRCODE='0A000';
  END IF;

  IF v_claim.status <> 'covered' THEN
    RAISE EXCEPTION 'Only a covered claim can start resolution (status: %)', v_claim.status USING ERRCODE='42501';
  END IF;

  IF v_claim.warranty_type = 'sale' THEN
    -- ── Sales return (unchanged) ──
    SELECT id, sale_order_id, sale_delivery_line_id, brand_variant_id, item_name, sku
      INTO v_rec
      FROM warranty_records
      WHERE id = v_claim.warranty_record_id;
    IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;

    SELECT sale_delivery_id INTO v_delivery_id
      FROM sale_delivery_lines
      WHERE id = v_rec.sale_delivery_line_id;

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

    INSERT INTO return_lines (
      return_id, brand_variant_id, item_name, sku, qty, condition, sale_delivery_line_id
    ) VALUES (
      v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_claim.claim_qty, 'inspection', v_rec.sale_delivery_line_id
    );

  ELSE
    -- ── Consumption return (Phase 4) ──
    SELECT id, consumption_id, consumption_line_id, brand_variant_id, item_name, sku
      INTO v_rec
      FROM warranty_records
      WHERE id = v_claim.warranty_record_id;
    IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Warranty record not found'; END IF;
    IF v_rec.consumption_id IS NULL OR v_rec.consumption_line_id IS NULL THEN
      RAISE EXCEPTION 'Consumption warranty record % is missing its consumption linkage', v_rec.id;
    END IF;

    -- The consumption return needs a division for the disposition/restock
    -- sub-container resolution (no sale-order fallback exists). Prefer the
    -- claim's division, else the consumption's.
    v_division := COALESCE(
      v_claim.division_id,
      (SELECT ce.division_id FROM consumption_entries ce WHERE ce.id = v_rec.consumption_id)
    );

    PERFORM pg_advisory_xact_lock(hashtext('so_po_returns_return_number'));
    SELECT 'CR-' || lpad((count(*) + 1)::text, 5, '0')
      INTO v_return_number
      FROM so_po_returns
      WHERE source_type = 'consumption';

    INSERT INTO so_po_returns (
      return_number, source_type, source_id,
      reason, status, division_id, warranty_claim_id,
      created_by, created_by_name
    ) VALUES (
      v_return_number, 'consumption', v_rec.consumption_id,
      'Warranty claim ' || v_claim.claim_number, 'pending_inspection', v_division, p_claim_id,
      v_profile, v_profile_name
    )
    RETURNING id INTO v_return_id;

    INSERT INTO return_lines (
      return_id, brand_variant_id, item_name, sku, qty, condition, consumption_line_id
    ) VALUES (
      v_return_id, v_rec.brand_variant_id, v_rec.item_name, v_rec.sku, v_claim.claim_qty, 'inspection', v_rec.consumption_line_id
    );
  END IF;

  UPDATE warranty_claims
    SET status = 'in_progress', linked_return_id = v_return_id, updated_at = now()
    WHERE id = p_claim_id;

  RETURN v_return_id;
END;
$function$;

-- ─── 2. Inspection split — carry consumption_line_id + accept consumption perm ─
CREATE OR REPLACE FUNCTION public.rpc_complete_return_inspection(p_return_id uuid, p_splits jsonb, p_restock_warehouse_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_return         RECORD;
  v_split          RECORD;
  v_line           RECORD;
  v_seen_lines     UUID[] := ARRAY[]::UUID[];
  v_pending_insp   INT;
BEGIN
  IF NOT (public._auth_user_has_permission('sales.returns.create') OR public._auth_user_has_permission('sales.returns.manage')
       OR public._auth_user_has_permission('purchase.returns.create') OR public._auth_user_has_permission('purchase.returns.manage')
       OR public._auth_user_has_permission('consumption.returns.create') OR public._auth_user_has_permission('consumption.returns.manage')) THEN
    RAISE EXCEPTION 'Not authorized to complete return inspection' USING ERRCODE = '42501';
  END IF;
  SELECT id, status, return_number, division_id
  INTO   v_return
  FROM   so_po_returns
  WHERE  id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found', p_return_id;
  END IF;

  IF v_return.status <> 'pending_inspection' THEN
    RAISE EXCEPTION 'Return % must be status=pending_inspection to complete inspection (got %)',
      v_return.return_number, v_return.status;
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'p_splits must be a non-empty JSON array';
  END IF;

  FOR v_split IN
    SELECT
      (elem->>'return_line_id')::uuid   AS line_id,
      COALESCE((elem->>'good_qty')::int, 0)     AS good_qty,
      COALESCE((elem->>'damaged_qty')::int, 0)  AS damaged_qty,
      NULLIF(elem->>'condition_notes', '')      AS condition_notes
    FROM jsonb_array_elements(p_splits) AS elem
  LOOP
    SELECT * INTO v_line
    FROM   return_lines
    WHERE  id = v_split.line_id
      AND  return_id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Return line % not found on return %', v_split.line_id, v_return.return_number;
    END IF;

    IF v_line.condition <> 'inspection' THEN
      RAISE EXCEPTION 'Return line % is not an inspection line (condition=%)',
        v_line.id, v_line.condition;
    END IF;

    IF v_split.good_qty < 0 OR v_split.damaged_qty < 0 THEN
      RAISE EXCEPTION 'Return line %: good_qty and damaged_qty must be non-negative', v_line.id;
    END IF;

    IF (v_split.good_qty + v_split.damaged_qty) <> v_line.qty THEN
      RAISE EXCEPTION 'Return line %: good_qty (%) + damaged_qty (%) must equal original qty (%)',
        v_line.id, v_split.good_qty, v_split.damaged_qty, v_line.qty;
    END IF;

    v_seen_lines := array_append(v_seen_lines, v_line.id);

    IF v_split.good_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id, consumption_line_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.good_qty, 'good', NULL,
        v_line.sale_delivery_line_id, v_line.receival_item_id, v_line.consumption_line_id
      );
    END IF;

    IF v_split.damaged_qty > 0 THEN
      INSERT INTO return_lines (
        return_id, brand_variant_id, item_name, sku,
        qty, condition, condition_notes,
        sale_delivery_line_id, receival_item_id, consumption_line_id
      ) VALUES (
        p_return_id, v_line.brand_variant_id, v_line.item_name, v_line.sku,
        v_split.damaged_qty, 'damaged',
        COALESCE(v_split.condition_notes, v_line.condition_notes),
        v_line.sale_delivery_line_id, v_line.receival_item_id, v_line.consumption_line_id
      );
    END IF;

    DELETE FROM return_lines WHERE id = v_line.id;
  END LOOP;

  SELECT COUNT(*)
  INTO   v_pending_insp
  FROM   return_lines
  WHERE  return_id = p_return_id
    AND  condition = 'inspection';

  IF v_pending_insp > 0 THEN
    RAISE EXCEPTION 'Return % still has % inspection line(s) not covered by the splits',
      v_return.return_number, v_pending_insp;
  END IF;

  UPDATE so_po_returns
  SET    restock_warehouse_id = p_restock_warehouse_id,
         status               = 'received',
         updated_at           = now()
  WHERE  id = p_return_id;
END;
$function$;

-- ─── 3. Resolve the claim when a CONSUMPTION warranty return closes ───────────
-- The sync trigger only recognised the sales terminal statuses
-- (resolved_credit / resolved_replacement / resolved_partial), so a consumption
-- warranty return — which has no customer/credit dimension and terminates at
-- status='closed' via _maybe_close_return — would leave its claim stuck at
-- 'in_progress'. Branch by source: a closed consumption warranty return flips the
-- claim to 'resolved' with no resolution_type / credit note (it was an internal
-- stock return, not a customer refund/credit/replacement). Sales path verbatim.
CREATE OR REPLACE FUNCTION public._sync_warranty_claim_from_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_all_replacement  boolean;
  v_all_store_credit boolean;
  v_all_refund       boolean;
  v_resolution_type  text;
BEGIN
  -- Consumption warranty return (Phase 4): no customer/credit dimension; the
  -- claim resolves once the return is fully processed (status='closed').
  IF NEW.source_type = 'consumption' THEN
    IF NEW.status <> 'closed' THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM warranty_claims WHERE id = NEW.warranty_claim_id AND status = 'in_progress'
    ) THEN
      RETURN NEW;
    END IF;
    UPDATE warranty_claims
      SET status = 'resolved',
          resolved_at = now(),
          resolution_type = NULL,
          linked_credit_note_id = NULL,
          updated_at = now()
      WHERE id = NEW.warranty_claim_id;
    RETURN NEW;
  END IF;

  -- Sales path (unchanged).
  IF NEW.status NOT IN ('resolved_credit','resolved_replacement','resolved_partial') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM warranty_claims WHERE id = NEW.warranty_claim_id AND status = 'in_progress'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_and(cr.resolution_type = 'replacement'),
    bool_and(cr.resolution_type = 'store_credit'),
    bool_and(cr.resolution_type = 'refund')
  INTO v_all_replacement, v_all_store_credit, v_all_refund
  FROM return_line_customer_resolutions cr
  JOIN return_lines rl ON rl.id = cr.return_line_id
  WHERE rl.return_id = NEW.id;

  v_resolution_type := CASE
    WHEN v_all_replacement  THEN 'replacement'
    WHEN v_all_refund       THEN 'refund'
    WHEN v_all_store_credit THEN 'credit'
    ELSE NULL
  END;

  UPDATE warranty_claims
    SET status = 'resolved',
        resolved_at = now(),
        linked_credit_note_id = NEW.credit_note_id,
        resolution_type = v_resolution_type,
        updated_at = now()
    WHERE id = NEW.warranty_claim_id;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
