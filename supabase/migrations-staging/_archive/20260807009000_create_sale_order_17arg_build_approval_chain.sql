-- create_sale_order (17-arg overload) resolves v_so_status to
-- 'pending_approval' when v_total_qar > v_available, but the body
-- (rewritten in 20260725110001) forgot to call
-- build_sales_approval_chain(v_so_id, 'credit', ...). Result: the SO
-- shows "Pending Approval" on the orders page, but the Sales Approvals
-- page has no row for it — the approval slip was never created, so no
-- approver can act.
--
-- The 18-arg overload has the full call pattern; port it into the
-- 17-arg via string-splice on the live body (avoids re-pasting 5KB
-- of RPC verbatim). Backfill the missing chain for any currently-
-- pending_approval SO that has no rows in sale_order_approvals.

DO $migrate$
DECLARE
  v_body  text;
  v_marker text;
  v_inject text;
  v_pos   int;
  v_oid   oid;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_sale_order'
     AND p.pronargs = 17;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'create_sale_order 17-arg overload not found';
  END IF;

  v_body := pg_get_functiondef(v_oid);

  IF position('build_sales_approval_chain' in v_body) > 0 THEN
    RAISE NOTICE 'create_sale_order 17-arg already calls build_sales_approval_chain — skipping';
    RETURN;
  END IF;

  -- Anchor the insertion right before the final RETURN jsonb_build_object(
  -- (the RETURN that returns 'so_id', 'so_number', 'status', ...).
  v_marker := chr(10) || '  RETURN jsonb_build_object(' || chr(10)
              || '    ''so_id'',';

  v_inject :=
    chr(10)
    || '  IF v_so_status = ''pending_approval''::sale_order_status THEN'
    || chr(10)
    || '    PERFORM public.build_sales_approval_chain('
    || chr(10)
    || '      v_so_id, ''credit'','
    || chr(10)
    || '      jsonb_build_object('
    || chr(10)
    || '        ''available'',    GREATEST(v_available, 0),'
    || chr(10)
    || '        ''overage'',      v_total_qar - v_available,'
    || chr(10)
    || '        ''requested_by'', v_profile_id'
    || chr(10)
    || '      )'
    || chr(10)
    || '    );'
    || chr(10)
    || '  END IF;'
    || chr(10)
    || v_marker;

  v_pos := position(v_marker in v_body);
  IF v_pos = 0 THEN
    RAISE EXCEPTION 'create_sale_order 17-arg: RETURN anchor not found';
  END IF;

  v_body := substring(v_body from 1 for v_pos - 1)
         || v_inject
         || substring(v_body from v_pos + length(v_marker));

  EXECUTE v_body;
END $migrate$;

-- Backfill: any SO currently at pending_approval status with no
-- approval rows gets the chain built now. Uses v_profile_id proxy —
-- created_by — as the requester since the SO record captured it.
DO $backfill$
DECLARE
  v_so         RECORD;
  v_available  numeric;
  v_open_total numeric;
BEGIN
  FOR v_so IN
    SELECT so.id, so.customer_id, so.total_qar, so.created_by,
           cg.credit_limit
      FROM sale_orders so
      JOIN customers c ON c.id = so.customer_id
      LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
     WHERE so.status = 'pending_approval'
       AND so.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM sale_order_approvals soa
          WHERE soa.source_type = 'sale_order'
            AND soa.source_id   = so.id
            AND soa.approval_type = 'credit'
       )
  LOOP
    -- Reconstruct available at time of decision — approximation using
    -- current open_total (excludes this SO since we filter its status,
    -- but includes any other opens). Not perfect but the slip needs the
    -- fields to render; approvers act on the overage magnitude which is
    -- still meaningful.
    SELECT COALESCE(SUM(total), 0) INTO v_open_total
      FROM sale_orders
     WHERE customer_id = v_so.customer_id
       AND status      NOT IN ('cancelled')
       AND id          <> v_so.id
       AND deleted_at  IS NULL;

    v_available := COALESCE(v_so.credit_limit, 0) - v_open_total;

    PERFORM public.build_sales_approval_chain(
      v_so.id, 'credit',
      jsonb_build_object(
        'available',    GREATEST(v_available, 0),
        'overage',      v_so.total_qar - v_available,
        'requested_by', v_so.created_by
      )
    );

    RAISE NOTICE 'Backfilled credit approval chain for SO %', v_so.id;
  END LOOP;
END $backfill$;
