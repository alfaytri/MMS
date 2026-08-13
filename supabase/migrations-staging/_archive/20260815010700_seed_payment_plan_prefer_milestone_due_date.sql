-- SO milestones now carry an optional `due_date` (populated by the New/Edit
-- SO form's date input). Update the seed helper to prefer that value when
-- present, and fall back to the label heuristic otherwise.
--
-- Plan type stays 'schedule' when EVERY milestone ends up with a date
-- (from either source), 'adhoc' when at least one has none.

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

  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_sum_pct := v_sum_pct + COALESCE((v_milestone->>'percent')::numeric, 0);
  END LOOP;
  IF abs(v_sum_pct - 100) > 0.5 THEN RETURN NULL; END IF;

  v_n := jsonb_array_length(v_milestones);

  -- First pass — decide plan_type. Prefer explicit `due_date` on the
  -- milestone; fall back to the label heuristic.
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(v_milestones) LOOP
    v_label := lower(COALESCE(v_milestone->>'label', ''));
    v_due := CASE
      WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
        THEN (v_milestone->>'due_date')::date
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

  -- Second pass — insert installments with the resolved due dates.
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
        WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
          THEN (v_milestone->>'due_date')::date
        WHEN v_label ~ 'advance'                                              THEN CURRENT_DATE
        WHEN v_label ~ 'delivery' AND v_expected_delivery IS NOT NULL         THEN v_expected_delivery
        WHEN v_label ~ 'net\s*[0-9]+'
          THEN CURRENT_DATE + (substring(v_label FROM 'net\s*([0-9]+)'))::int
        ELSE NULL
      END;
    ELSE
      -- Ad-hoc: preserve explicit dates the user typed; otherwise NULL.
      v_due := CASE
        WHEN NULLIF(v_milestone->>'due_date', '') IS NOT NULL
          THEN (v_milestone->>'due_date')::date
        ELSE NULL
      END;
    END IF;

    INSERT INTO payment_installments (plan_id, due_date, amount)
    VALUES (v_plan_id, v_due, v_amount);
  END LOOP;

  RETURN v_plan_id;
END $$;

REVOKE ALL ON FUNCTION public.rpc_seed_payment_plan_from_so(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_seed_payment_plan_from_so(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
