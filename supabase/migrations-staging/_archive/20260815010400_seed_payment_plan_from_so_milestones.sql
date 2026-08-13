-- Wire SO payment_milestones into payment_plans + payment_installments.
--
-- The New/Edit SO form collects payment terms + custom milestones
-- (`{ label, percent }[]`) and stores them on `sale_orders.payment_milestones`
-- as jsonb. Until now the field was decorative — nothing ever materialised
-- into the `payment_plans` + `payment_installments` tables that the Payments
-- tab / PaymentPlanDialog use.
--
-- This migration:
--   1. Adds helper `rpc_seed_payment_plan_from_so(invoice_id, so_id)`:
--        • Idempotent — no-op if a plan already exists for the invoice.
--        • No-op for cash invoices (payment plans are a credit-only concept).
--        • No-op when milestones are empty / null / don't sum to ~100%.
--        • Computes due_date per milestone from the label:
--            "advance"                → today
--            "delivery" (any casing)  → so.expected_delivery (if set)
--            "net N days" pattern     → today + N
--            anything else            → NULL
--        • plan_type='schedule' when EVERY milestone gets a date, else 'adhoc'.
--        • Last installment absorbs rounding residue so amounts sum exactly.
--
--   2. Patches `rpc_sync_invoice_from_so` (20260807005000) to call the
--      helper right after it auto-creates a fresh invoice on a confirmed
--      SO. Existing invoices are NOT re-seeded — operator uses
--      PaymentPlanDialog to make later changes.
--
-- Safe by design: never DELETEs or replaces an existing plan; a corrupt
-- (percent-sum ≠ 100) milestone list is skipped rather than silently
-- creating a mis-balanced plan.

BEGIN;

-- ── Helper ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_seed_payment_plan_from_so(
  p_invoice_id uuid,
  p_so_id      uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_delivery date;
  v_milestones        jsonb;
  v_invoice_type      text;
  v_total             numeric;
  v_plan_id           uuid;
  v_plan_type         text := 'schedule';
  v_milestone         jsonb;
  v_amount            numeric;
  v_due               date;
  v_label             text;
  v_pct               numeric;
  v_sum_pct           numeric := 0;
  v_running           numeric := 0;
  v_n                 int;
  v_i                 int := 0;
BEGIN
  SELECT so.expected_delivery, so.payment_milestones,
         si.invoice_type::text, si.total_amount
    INTO v_expected_delivery, v_milestones, v_invoice_type, v_total
    FROM sale_orders so
    JOIN so_invoices si ON si.id = p_invoice_id
   WHERE so.id = p_so_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_invoice_type <> 'credit' THEN RETURN NULL; END IF;
  IF v_milestones IS NULL OR jsonb_array_length(v_milestones) = 0 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM payment_plans WHERE invoice_id = p_invoice_id) THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_total, 0) <= 0 THEN RETURN NULL; END IF;

  -- Percentages must sum to ~100 (allow tiny float noise).
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_sum_pct := v_sum_pct + COALESCE((v_milestone->>'percent')::numeric, 0);
  END LOOP;
  IF abs(v_sum_pct - 100) > 0.5 THEN RETURN NULL; END IF;

  v_n := jsonb_array_length(v_milestones);

  -- First pass — if any milestone label doesn't map to a due_date, downgrade
  -- the plan to 'adhoc' so the operator can fill dates later via the dialog.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_label := lower(COALESCE(v_milestone->>'label', ''));
    v_due := CASE
      WHEN v_label ~ 'advance'                                              THEN CURRENT_DATE
      WHEN v_label ~ 'delivery' AND v_expected_delivery IS NOT NULL         THEN v_expected_delivery
      WHEN v_label ~ 'net\s*[0-9]+'
        THEN CURRENT_DATE + (substring(v_label FROM 'net\s*([0-9]+)'))::int
      ELSE NULL
    END;
    IF v_due IS NULL THEN v_plan_type := 'adhoc'; END IF;
  END LOOP;

  INSERT INTO payment_plans (invoice_id, plan_type, total_amount)
  VALUES (p_invoice_id, v_plan_type, v_total)
  RETURNING id INTO v_plan_id;

  -- Second pass — insert installments. Amount rounded per row; residue
  -- pushed onto the last row so the total lands exactly on v_total.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_i     := v_i + 1;
    v_pct   := COALESCE((v_milestone->>'percent')::numeric, 0);
    v_label := lower(COALESCE(v_milestone->>'label', ''));

    IF v_i = v_n THEN
      v_amount := v_total - v_running;
    ELSE
      v_amount := round(v_total * v_pct / 100.0, 2);
      v_running := v_running + v_amount;
    END IF;

    IF v_plan_type = 'schedule' THEN
      v_due := CASE
        WHEN v_label ~ 'advance'                                              THEN CURRENT_DATE
        WHEN v_label ~ 'delivery' AND v_expected_delivery IS NOT NULL         THEN v_expected_delivery
        WHEN v_label ~ 'net\s*[0-9]+'
          THEN CURRENT_DATE + (substring(v_label FROM 'net\s*([0-9]+)'))::int
        ELSE NULL
      END;
    ELSE
      v_due := NULL;
    END IF;

    INSERT INTO payment_installments (plan_id, due_date, amount)
    VALUES (v_plan_id, v_due, v_amount);
  END LOOP;

  RETURN v_plan_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_seed_payment_plan_from_so(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_seed_payment_plan_from_so(uuid, uuid) TO authenticated, service_role;

-- ── Patch rpc_sync_invoice_from_so ─────────────────────────────────────
-- Add the seed call to the 'created' branch. Use pg_get_functiondef + splice
-- so we edit the CURRENT live body rather than re-pasting the full RPC.
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

  IF position('rpc_seed_payment_plan_from_so' in v_body) > 0 THEN
    RAISE NOTICE 'rpc_sync_invoice_from_so already calls rpc_seed_payment_plan_from_so — skipping';
    RETURN;
  END IF;

  -- Anchor: the RETURN block of the created-branch, right before its jsonb.
  v_marker := E'  RETURN jsonb_build_object(\n    ''action'',           ''created'',';

  v_inject := E'  -- Auto-seed payment plan from SO milestones (idempotent).\n  PERFORM public.rpc_seed_payment_plan_from_so(v_new_inv_id, p_so_id);\n\n' || v_marker;

  v_pos := position(v_marker in v_body);
  IF v_pos = 0 THEN
    RAISE EXCEPTION
      'rpc_sync_invoice_from_so: created-branch RETURN anchor not found — live body drifted';
  END IF;

  v_body := substring(v_body from 1 for v_pos - 1)
         || v_inject
         || substring(v_body from v_pos + length(v_marker));

  EXECUTE v_body;
  RAISE NOTICE 'rpc_sync_invoice_from_so patched: seeds payment plan after invoice creation';
END $migrate$;

COMMIT;

NOTIFY pgrst, 'reload schema';
