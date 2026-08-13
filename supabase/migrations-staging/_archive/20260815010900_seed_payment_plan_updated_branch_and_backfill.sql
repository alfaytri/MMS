-- Wider seeding for payment plans.
--
-- 20260815010400 patched rpc_sync_invoice_from_so's CREATED branch to call
-- rpc_seed_payment_plan_from_so. That misses two cases:
--
--   1. SOs whose invoice was auto-created before that migration landed —
--      the invoice exists but no plan was ever seeded.
--   2. Users who first confirm an SO (creating the invoice), then go back
--      and set/edit payment milestones. The next invoice sync hits the
--      UPDATED branch, which skips the seed.
--
-- The seed helper itself is already idempotent (short-circuits when a plan
-- exists, when milestones are empty, when %-sum ≠ 100, etc.), so calling
-- it from the UPDATED branch too is safe.
--
-- Also: one-off backfill for existing invoices.

BEGIN;

-- ── 1. Patch the UPDATED branch of rpc_sync_invoice_from_so ────────────
DO $migrate$
DECLARE
  v_body    text;
  v_oid     oid;
  v_marker  text;
  v_inject  text;
  v_pos     int;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'rpc_sync_invoice_from_so'
     AND p.pronargs = 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'rpc_sync_invoice_from_so not found';
  END IF;

  v_body := pg_get_functiondef(v_oid);

  -- Anchor: the RETURN block of the UPDATED branch. It reads
  -- "    RETURN jsonb_build_object(\n      'action',      'updated',".
  v_marker := E'    RETURN jsonb_build_object(\n      ''action'',      ''updated'',';

  -- If the UPDATED branch already calls the seed helper, splice would
  -- inject a second copy. Detect that by looking for the marker+injected
  -- call combined.
  IF position(E'PERFORM public.rpc_seed_payment_plan_from_so(v_invoice.id' in v_body) > 0 THEN
    RAISE NOTICE 'rpc_sync_invoice_from_so UPDATED branch already seeds — skipping';
  ELSE
    v_inject := E'    -- Seed payment plan from SO milestones (idempotent no-op if a plan exists).\n    PERFORM public.rpc_seed_payment_plan_from_so(v_invoice.id, p_so_id);\n\n' || v_marker;

    v_pos := position(v_marker in v_body);
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'rpc_sync_invoice_from_so: UPDATED-branch RETURN anchor not found — body drifted';
    END IF;

    v_body := substring(v_body from 1 for v_pos - 1)
           || v_inject
           || substring(v_body from v_pos + length(v_marker));

    EXECUTE v_body;
    RAISE NOTICE 'rpc_sync_invoice_from_so patched: UPDATED branch now seeds plans';
  END IF;
END $migrate$;

-- ── 2. Backfill existing invoices ──────────────────────────────────────
-- Walk every so_invoice whose SO has non-empty milestones and no existing
-- plan, then call the seed helper. Helper handles all the guardrails.
DO $backfill$
DECLARE
  v_row       RECORD;
  v_plan_id   uuid;
  v_seeded    int := 0;
  v_scanned   int := 0;
BEGIN
  FOR v_row IN
    SELECT si.id AS invoice_id, so.id AS so_id
      FROM so_invoices si
      JOIN sale_orders so ON so.id = si.sale_order_id
     WHERE so.deleted_at IS NULL
       AND so.payment_milestones IS NOT NULL
       AND jsonb_array_length(so.payment_milestones) > 0
       AND NOT EXISTS (
         SELECT 1 FROM payment_plans pp WHERE pp.invoice_id = si.id
       )
  LOOP
    v_scanned := v_scanned + 1;
    v_plan_id := public.rpc_seed_payment_plan_from_so(v_row.invoice_id, v_row.so_id);
    IF v_plan_id IS NOT NULL THEN
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Payment-plan backfill: scanned=%, seeded=%', v_scanned, v_seeded;
END $backfill$;

COMMIT;

NOTIFY pgrst, 'reload schema';
