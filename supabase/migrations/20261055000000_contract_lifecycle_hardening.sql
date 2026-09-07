-- Contract module hardening (audit follow-up).
--
-- Fixes, all server-side and atomic:
--   #2  Double-discount on activation — payments are now built from the
--       already-net total_value (the caller passes the computed rows); this
--       migration only sums what it is given, never re-subtracts discount.
--   #3  Non-atomic transitions — activation / cancellation / record-payment
--       are single-transaction SECURITY DEFINER RPCs (idempotent, permission
--       gated) instead of a sequence of client writes.
--   #4  Payments could never be marked paid — rpc_record_contract_payment.
--   #6  Dead optimistic-lock — contracts now has an updated_at BEFORE-UPDATE
--       trigger so contracts.updated_at actually advances.
--   #7  Cancellation had no money treatment — rpc_cancel_contract voids
--       payments due AFTER the current month (keeps current + past owed).
--   #5/#8/#9/#10  Live board — contract_board_summary() returns one compact,
--       visibility-filtered row per live contract with a SQL-derived status
--       and SQL aggregates, so the list no longer embeds every visit row nor
--       computes per-page KPIs, and the visit counters are trigger-maintained.
BEGIN;

-- ---------------------------------------------------------------------------
-- #6  updated_at trigger on contracts (reuse the house helper set_updated_at)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_contracts_set_updated_at ON public.contracts;
CREATE TRIGGER trg_contracts_set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- #10  Keep contracts.total_visits / completed_visits in sync with reality
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_contract_visit_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract uuid := COALESCE(NEW.contract_id, OLD.contract_id);
BEGIN
  UPDATE public.contracts c
  SET total_visits     = agg.total,
      completed_visits = agg.done
  FROM (
    SELECT COUNT(*)                                  AS total,
           COUNT(*) FILTER (WHERE completed = true)  AS done
    FROM public.contract_visits
    WHERE contract_id = v_contract
  ) agg
  WHERE c.id = v_contract;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contract_visits_counts ON public.contract_visits;
CREATE TRIGGER trg_contract_visits_counts
  AFTER INSERT OR UPDATE OF completed, contract_id OR DELETE ON public.contract_visits
  FOR EACH ROW EXECUTE FUNCTION public.sync_contract_visit_counts();

-- ---------------------------------------------------------------------------
-- #2 + #3  Atomic activation. Caller passes the already-net payment rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_activate_contract(
  p_contract_id uuid,
  p_payments    jsonb,
  p_user_id     uuid,
  p_user_name   text
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status   text;
  v_existing text;
  v_terms    jsonb;
  v_new_id   text;
  v_total    numeric;
BEGIN
  IF NOT public._auth_user_has_permission('contracts.activate')
     AND NOT public._auth_user_has_permission('contracts.live.manage') THEN
    RAISE EXCEPTION 'Not authorized to activate contracts' USING ERRCODE = '42501';
  END IF;

  SELECT status, contract_id, terms_snapshot
    INTO v_status, v_existing, v_terms
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  -- Idempotent: a retry after a partial failure must not double-generate
  -- an id or duplicate the payment schedule.
  IF v_status = 'active' THEN
    RETURN v_existing;
  END IF;

  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'contract_not_approved' USING DETAIL = 'status=' || v_status;
  END IF;

  v_new_id := public.generate_contract_id();

  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' THEN
    INSERT INTO public.contract_payments (contract_id, due_date, amount, status)
    SELECT p_contract_id, (elem->>'due_date')::date,
           (elem->>'amount')::numeric, COALESCE(elem->>'status', 'pending')
    FROM jsonb_array_elements(p_payments) elem;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.contract_payments WHERE contract_id = p_contract_id;

  UPDATE public.contracts
  SET contract_id    = v_new_id,
      status         = 'active',
      has_signed_doc = true,
      terms_snapshot = COALESCE(v_terms, jsonb_build_object('captured_at', now())),
      total_payments = v_total,
      paid_amount    = 0
  WHERE id = p_contract_id;

  RETURN v_new_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- #3 + #7  Atomic cancellation. Voids future (unearned) unpaid payments —
--          those due AFTER the end of the current month — keeps current+past.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_contract(
  p_contract_id uuid,
  p_reason      text,
  p_user_id     uuid,
  p_user_name   text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status     text;
  v_month_end  date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT public._auth_user_has_permission('contracts.live.manage') THEN
    RAISE EXCEPTION 'Not authorized to cancel contracts' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.contracts WHERE id = p_contract_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN;  -- idempotent
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'contract_not_active' USING DETAIL = 'status=' || v_status;
  END IF;

  -- Remove future, not-yet-done visits.
  DELETE FROM public.contract_visits
  WHERE contract_id = p_contract_id
    AND completed = false
    AND scheduled_date > current_date;

  -- Void unpaid payments that fall after the current month (unearned).
  DELETE FROM public.contract_payments
  WHERE contract_id = p_contract_id
    AND status <> 'paid'
    AND due_date > v_month_end;

  UPDATE public.contracts c
  SET status         = 'cancelled',
      cancelled_date = now(),
      cancel_reason  = p_reason,
      total_payments = COALESCE((SELECT SUM(amount) FROM public.contract_payments WHERE contract_id = p_contract_id), 0),
      paid_amount    = COALESCE((SELECT SUM(amount) FROM public.contract_payments WHERE contract_id = p_contract_id AND status = 'paid'), 0)
  WHERE c.id = p_contract_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- #4  Record a scheduled payment as collected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_record_contract_payment(
  p_payment_id uuid,
  p_user_id    uuid,
  p_user_name  text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_contract uuid;
  v_status   text;
BEGIN
  IF NOT public._auth_user_has_permission('contracts.live.manage') THEN
    RAISE EXCEPTION 'Not authorized to record contract payments' USING ERRCODE = '42501';
  END IF;

  SELECT contract_id, status INTO v_contract, v_status
  FROM public.contract_payments WHERE id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;
  IF v_status = 'paid' THEN
    RETURN;  -- idempotent
  END IF;

  UPDATE public.contract_payments SET status = 'paid' WHERE id = p_payment_id;

  UPDATE public.contracts c
  SET paid_amount = COALESCE((
        SELECT SUM(amount) FROM public.contract_payments
        WHERE contract_id = v_contract AND status = 'paid'), 0)
  WHERE c.id = v_contract;
END;
$function$;

-- ---------------------------------------------------------------------------
-- #5/#8/#9/#10  Live-contract board: one compact, visibility-filtered row per
--          live contract, with a SQL-derived status and SQL aggregates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_board_summary()
 RETURNS TABLE (
   id uuid,
   contract_id text,
   stored_status text,
   derived_status text,
   customer_name text,
   site_name text,
   phone text,
   agent_name text,
   divisions text[],
   services_summary text,
   start_date date,
   end_date date,
   monthly_value numeric,
   total_value numeric,
   area_count int,
   has_signed_doc boolean,
   cancelled_date timestamptz,
   cancel_reason text,
   payment_schedule text,
   total_visits int,
   completed_visits int,
   total_payments numeric,
   paid_amount numeric,
   overdue_unpaid boolean,
   current_period_unpaid numeric,
   next_due_date date,
   upcoming_visits jsonb
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH live AS (
    SELECT c.*
    FROM public.contracts c
    WHERE c.status::text = ANY (ARRAY['active','expiring_soon','overdue_payment','completed','cancelled'])
      AND public.is_contract_visible(c.id)
  ),
  pay AS (
    SELECT contract_id,
           COALESCE(SUM(amount), 0)                                       AS pay_total,
           COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)        AS pay_paid,
           bool_or(status <> 'paid' AND due_date < current_date)         AS overdue_unpaid,
           COALESCE(SUM(amount) FILTER (
             WHERE status <> 'paid'
               AND date_trunc('month', due_date) = date_trunc('month', current_date)), 0) AS current_period_unpaid,
           MIN(due_date) FILTER (WHERE status <> 'paid')                 AS next_due_date
    FROM public.contract_payments GROUP BY contract_id
  ),
  vis AS (
    SELECT contract_id,
           COUNT(*)::int                                       AS v_total,
           COUNT(*) FILTER (WHERE completed = true)::int       AS v_done
    FROM public.contract_visits GROUP BY contract_id
  ),
  upc AS (
    SELECT cv.contract_id,
           jsonb_agg(jsonb_build_object(
             'date', cv.scheduled_date, 'service_name', cv.service_name,
             'team_name', t.name_en) ORDER BY cv.scheduled_date) AS upcoming
    FROM (
      SELECT cv.*, row_number() OVER (PARTITION BY cv.contract_id ORDER BY cv.scheduled_date) AS rn
      FROM public.contract_visits cv
      WHERE cv.completed = false AND cv.scheduled_date >= current_date
    ) cv
    LEFT JOIN public.teams t ON t.id = cv.team_id
    WHERE cv.rn <= 6
    GROUP BY cv.contract_id
  )
  SELECT
    l.id,
    COALESCE(l.contract_id, ''),
    l.status::text,
    CASE
      WHEN l.status::text = 'cancelled' THEN 'cancelled'
      WHEN COALESCE(v.v_total,0) > 0 AND COALESCE(v.v_done,0) = v.v_total
           AND COALESCE(p.pay_total,0) > 0 AND COALESCE(p.pay_paid,0) >= p.pay_total THEN 'completed'
      WHEN COALESCE(p.overdue_unpaid, false) THEN 'overdue_payment'
      WHEN l.end_date <= (current_date + 30) THEN 'expiring_soon'
      ELSE 'active'
    END AS derived_status,
    COALESCE(l.customer_name,''), COALESCE(l.site_name,''), COALESCE(l.phone,''),
    COALESCE(l.agent_name,''), COALESCE(l.divisions, ARRAY[]::text[]),
    COALESCE(l.services_summary,''),
    l.start_date, l.end_date,
    COALESCE(l.monthly_value,0), COALESCE(l.total_value,0),
    COALESCE(l.area_count,0), COALESCE(l.has_signed_doc,false),
    l.cancelled_date, l.cancel_reason,
    COALESCE(l.payment_frequency,''),
    COALESCE(v.v_total,0), COALESCE(v.v_done,0),
    COALESCE(p.pay_total,0), COALESCE(p.pay_paid,0),
    COALESCE(p.overdue_unpaid,false), COALESCE(p.current_period_unpaid,0),
    p.next_due_date,
    COALESCE(u.upcoming, '[]'::jsonb)
  FROM live l
  LEFT JOIN pay p ON p.contract_id = l.id
  LEFT JOIN vis v ON v.contract_id = l.id
  LEFT JOIN upc u ON u.contract_id = l.id;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_activate_contract(uuid, jsonb, uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_contract(uuid, text, uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_contract_payment(uuid, uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_board_summary()                         TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
