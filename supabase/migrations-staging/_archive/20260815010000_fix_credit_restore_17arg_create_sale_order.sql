-- Fix credit-customer credit restoration on payment.
--
-- Two overloads of create_sale_order live on staging today:
--   • 17-arg (…, p_division_id uuid DEFAULT NULL)
--       ── the one the app calls (see src/hooks/useSaleOrders.ts).
--       Still uses raw `SELECT SUM(total)` to compute credit used, so
--       paid credit customers never see their limit free up.
--   • 18-arg (…, p_subtotal, p_notes, p_line_items, p_division_id)
--       ── DIFFERENT signature (p_subtotal, p_notes) that no client code
--       passes. Dead code left over from a signature migration.
--
-- Verified live 2026-08-07: "Test Credit" customer, credit_limit=30,000,
-- SUM(total)=337,000, computed available=-307,000 regardless of payments.
--
-- Fix:
--   1. Splice the 17-arg's SUM(total) block to call the payments-aware
--      helper `public.customer_credit_used(p_customer_id, NULL)` — same
--      helper `resubmit_sale_order` already uses. One formula, one truth.
--   2. Drop the 18-arg overload entirely — nothing calls it and keeping
--      it around invites the same bug being reintroduced there later.
--
-- Uses pg_get_functiondef so we edit the CURRENT live body — safer than
-- re-pasting the full RPC verbatim.

DO $migrate$
DECLARE
  v_body   text;
  v_oid    oid;
  v_marker text;
  v_inject text;
  v_pos    int;
BEGIN
  -- The 17-arg overload the app calls. pronargs=17, pronargdefaults=1
  -- (p_division_id has DEFAULT NULL). Match on arg name list to be sure
  -- we don't accidentally splice the 18-arg (different arg names).
  SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_sale_order'
     AND p.pronargs = 17
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_customer_notes%'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_division_id%';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'create_sale_order 17-arg (legacy) overload not found — inspect pg_proc before retrying';
  END IF;

  v_body := pg_get_functiondef(v_oid);

  IF position('customer_credit_used' in v_body) > 0 THEN
    RAISE NOTICE 'create_sale_order 17-arg already uses customer_credit_used — skipping splice';
  ELSE
    -- Match the exact block that landed in
    -- 20260725110001_rewrite_sale_order_functions_use_user_data.sql (line 247+).
    v_marker := E'    SELECT COALESCE(SUM(total), 0)\n    INTO   v_open_total\n    FROM   sale_orders\n    WHERE  customer_id = p_customer_id\n      AND  status      NOT IN (''cancelled'')\n      AND  deleted_at  IS NULL;';

    v_inject := '    v_open_total := public.customer_credit_used(p_customer_id, NULL);';

    v_pos := position(v_marker in v_body);
    IF v_pos = 0 THEN
      RAISE EXCEPTION
        'create_sale_order 17-arg: SUM(total) anchor not found — live body may have drifted; inspect pg_get_functiondef output before retrying';
    END IF;

    v_body := substring(v_body from 1 for v_pos - 1)
           || v_inject
           || substring(v_body from v_pos + length(v_marker));

    EXECUTE v_body;
    RAISE NOTICE 'create_sale_order 17-arg patched: v_open_total now via customer_credit_used()';
  END IF;
END $migrate$;

-- Drop the dead 18-arg overload (different signature, unused).
-- Match on argument identity string so we don't accidentally drop the
-- 17-arg overload. The 18-arg's signature is unique in containing
-- `p_subtotal` and `p_notes` (the 17-arg has neither).
DO $drop18$
DECLARE
  v_sig text;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid)
    INTO v_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'create_sale_order'
     AND p.pronargs = 18
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_subtotal%'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_notes%';

  IF v_sig IS NULL THEN
    RAISE NOTICE 'create_sale_order 18-arg (dead) overload not found — nothing to drop';
  ELSE
    EXECUTE format('DROP FUNCTION public.create_sale_order(%s)', v_sig);
    RAISE NOTICE 'Dropped dead create_sale_order 18-arg overload';
  END IF;
END $drop18$;

-- Post-fix audit — count pending_approval SOs that would now clear the
-- credit gate under the corrected formula. Read-only; no auto-approvals.
DO $audit$
DECLARE
  v_now_ok integer;
BEGIN
  SELECT count(*) INTO v_now_ok
    FROM sale_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id
   WHERE so.status = 'pending_approval'
     AND so.deleted_at IS NULL
     AND COALESCE(cg.credit_limit, 0)
       - public.customer_credit_used(so.customer_id, so.id)
       >= so.total_qar;

  RAISE NOTICE 'Post-fix audit: % pending_approval SO(s) would now pass the credit gate on resubmit', v_now_ok;
END $audit$;

NOTIFY pgrst, 'reload schema';
