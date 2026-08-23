-- Fail-closed guard for empty PO approval bands.
--
-- rpc_build_po_approval_steps already raises when NO applicable tier exists (v_count=0),
-- but if a *middle* band had its roles removed, POs in that range still built steps from
-- the other bands and silently skipped the emptied band's required sign-off. Add an explicit
-- check: if ANY applicable band (min_amount <= total, not deleted) has an empty required_roles
-- array, block submission until an admin configures a role for it.
--
-- Body sourced from the live definition via pg_get_functiondef; only the empty-band EXISTS
-- check is added (before the step INSERT). SECURITY DEFINER + search_path=public unchanged.

CREATE OR REPLACE FUNCTION public.rpc_build_po_approval_steps(p_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_po        RECORD;
  v_chain_id  uuid;
  v_iteration int;
  v_count     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_qar, division_id, status
    INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: PO % not found', p_po_id;
  END IF;

  -- Caller must be able to see the PO's division (mirrors the row-visibility
  -- model). Legacy NULL-division POs are not gated on visibility.
  IF v_po.division_id IS NOT NULL AND NOT public.is_division_visible(v_po.division_id) THEN
    RAISE EXCEPTION 'rpc_build_po_approval_steps: not authorized for this PO' USING ERRCODE = '42501';
  END IF;

  -- Active chain: PO division first, else company-default (NULL division).
  SELECT id INTO v_chain_id
    FROM po_approval_chains
   WHERE is_active AND archived_at IS NULL AND division_id = v_po.division_id
   LIMIT 1;
  IF v_chain_id IS NULL THEN
    SELECT id INTO v_chain_id
      FROM po_approval_chains
     WHERE is_active AND archived_at IS NULL AND division_id IS NULL
     LIMIT 1;
  END IF;
  IF v_chain_id IS NULL THEN
    RAISE EXCEPTION 'No approval chain configured for this PO.';
  END IF;

  -- Fail closed: an applicable band with no approvers would silently drop its
  -- required sign-off. Block until an admin configures a role for that band.
  IF EXISTS (
    SELECT 1 FROM po_approval_chain_tiers t
     WHERE t.chain_id   = v_chain_id
       AND t.deleted_at IS NULL
       AND t.min_amount <= COALESCE(v_po.total_qar, 0)
       AND COALESCE(array_length(t.required_roles, 1), 0) = 0
  ) THEN
    RAISE EXCEPTION 'An approval band for this PO amount has no approvers configured. Ask an admin to add a role to it in Approval Settings.'
      USING ERRCODE = '23514';
  END IF;

  v_iteration := COALESCE((SELECT max(iteration) FROM po_approvals WHERE po_id = p_po_id), 0) + 1;

  -- Derive steps from the authoritative tier config: every tier whose
  -- min_amount <= the PO total, one pending step per required role.
  INSERT INTO po_approvals (po_id, role, tier_rank, status, is_active, iteration)
  SELECT p_po_id, r.role, t.rank, 'pending', true, v_iteration
    FROM po_approval_chain_tiers t
    CROSS JOIN LATERAL unnest(t.required_roles) AS r(role)
   WHERE t.chain_id      = v_chain_id
     AND t.deleted_at    IS NULL
     AND t.min_amount    <= COALESCE(v_po.total_qar, 0);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No approval tiers match this PO amount. Check the approval chain configuration.';
  END IF;

  RETURN jsonb_build_object('iteration', v_iteration, 'step_count', v_count);
END;
$function$;
