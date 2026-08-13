-- C1 (six-domains checklist): useConfirmSO bypassed approval chain.
--
-- Any authenticated user in the same division could flip a
-- pending_approval SO to confirmed via a raw
--   UPDATE sale_orders SET status = 'confirmed' WHERE id = <so_id>
-- which the RLS policy allows (division-visible → true).
--
-- The pending_approval → confirmed transition must go through
-- approve_sales_request / force_approve_sales_request, both of which
-- set the mms.approval_active flag before touching the SO status.
--
-- This trigger rejects any other pending_approval → confirmed
-- transition. Cash quotations (quotation → confirmed) and
-- confirmed → later states are unaffected.

CREATE OR REPLACE FUNCTION public._sale_orders_block_bypass_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'pending_approval'
     AND NEW.status = 'confirmed'
     AND current_setting('mms.approval_active', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION
      'sale_orders: direct pending_approval → confirmed transition is not allowed. '
      'Route through approve_sales_request / force_approve_sales_request.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sale_orders_block_bypass_approval ON public.sale_orders;

CREATE TRIGGER trg_sale_orders_block_bypass_approval
  BEFORE UPDATE OF status ON public.sale_orders
  FOR EACH ROW
  EXECUTE FUNCTION public._sale_orders_block_bypass_approval();

-- Enrich approve_sales_request / force_approve_sales_request so they set
-- the mms.approval_active flag before touching the SO row. Both are
-- SECURITY DEFINER, so the flag is scoped to their transaction only.

DO $migrate$
DECLARE
  v_body   text;
  -- pg_get_functiondef uses CRLF line endings on this cluster
  v_marker text := chr(13) || chr(10) || 'BEGIN' || chr(13) || chr(10);
  v_inject text := chr(13) || chr(10) || 'BEGIN' || chr(13) || chr(10)
                   || '  PERFORM set_config(''mms.approval_active'', ''1'', true);'
                   || chr(13) || chr(10);
  v_pos    int;
  v_oid    oid;
BEGIN
  FOR v_oid IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('approve_sales_request','force_approve_sales_request')
  LOOP
    v_body := pg_get_functiondef(v_oid);

    -- Only patch if the flag isn't already set. Splice the flag-setter
    -- into the outermost BEGIN block using POSITION + SUBSTRING (regex
    -- didn't survive shell escaping).
    IF position('mms.approval_active' in v_body) = 0 THEN
      v_pos := position(v_marker in v_body);
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'C1 fix: could not find outermost BEGIN in % body', v_oid::regprocedure;
      END IF;
      v_body := substring(v_body from 1 for v_pos - 1)
             || v_inject
             || substring(v_body from v_pos + length(v_marker));
      EXECUTE v_body;
    END IF;
  END LOOP;
END $migrate$;

-- Verify: both RPCs now carry the flag; the trigger is installed.
DO $verify$
DECLARE
  v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('approve_sales_request','force_approve_sales_request')
     AND position('mms.approval_active' in pg_get_functiondef(p.oid)) = 0;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'C1 fix: % approval RPC(s) missing mms.approval_active setter', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_sale_orders_block_bypass_approval'
       AND tgrelid = 'public.sale_orders'::regclass
  ) THEN
    RAISE EXCEPTION 'C1 fix: trigger trg_sale_orders_block_bypass_approval not installed';
  END IF;
END $verify$;
