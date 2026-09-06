-- Service-order approval actions + queue read. The Sales approve/reject RPCs are
-- sale_order-specific (they only understand margin/credit and touch sale_orders),
-- so orders get their own thin versions over the shared sale_order_approvals table:
--   • approve → when the last pending step of the order clears, book it (scheduled)
--   • reject  → cancel the order + delete its team assignments (free the held slot)
-- Authorization: hold `orders.approve` (system admins do, via is_system_admin), or
-- hold the approval-slot role named on the step (once admins configure roles).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_pending_order_approvals()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at ASC), '[]'::jsonb)
  FROM (
    SELECT
      a.id          AS approval_id,
      a.source_id   AS order_uuid,
      a.step_role,
      a.step_order,
      a.reason,
      a.created_at,
      o.order_id,
      o.total_amount,
      o.scheduled_date,
      o.division,
      o.is_emergency,
      sc.name       AS customer_name
    FROM public.sale_order_approvals a
    JOIN public.orders o             ON o.id = a.source_id
    LEFT JOIN public.service_customers sc ON sc.id = o.service_customer_id
    WHERE a.source_type   = 'order'
      AND a.approval_type = 'service_order'
      AND a.status        = 'pending'
      AND a.is_active
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.approve_order_request(p_request_id uuid, p_comment text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req        RECORD;
  v_profile_id uuid;
  v_full_name  text;
  v_remaining  int;
BEGIN
  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  SELECT * INTO v_req FROM public.sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active OR v_req.approval_type <> 'service_order' THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  IF NOT (
    public._auth_user_has_permission('orders.approve')
    OR (v_req.step_role IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.user_custom_roles ucr JOIN public.custom_roles cr ON cr.id = ucr.role_id
         WHERE ucr.profile_id = v_profile_id AND cr.name = v_req.step_role
           AND cr.is_approval_slot = true AND cr.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'You are not allowed to approve this order';
  END IF;

  UPDATE public.sale_order_approvals
  SET    status = 'approved', decided_by = v_profile_id, decided_by_name = v_full_name, comment = p_comment
  WHERE  id = p_request_id;

  SELECT count(*) INTO v_remaining FROM public.sale_order_approvals
  WHERE source_id = v_req.source_id AND approval_type = 'service_order'
    AND iteration = v_req.iteration AND status = 'pending';

  IF v_remaining = 0 THEN
    UPDATE public.orders SET status = 'scheduled'::order_status
    WHERE id = v_req.source_id AND status = 'pending-approval'::order_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_order_request(p_request_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req        RECORD;
  v_profile_id uuid;
  v_full_name  text;
BEGIN
  IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to reject'; END IF;

  SELECT id, full_name INTO v_profile_id, v_full_name FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  SELECT * INTO v_req FROM public.sale_order_approvals WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' OR NOT v_req.is_active OR v_req.approval_type <> 'service_order' THEN
    RAISE EXCEPTION 'Request not actionable';
  END IF;

  IF NOT (
    public._auth_user_has_permission('orders.approve')
    OR (v_req.step_role IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.user_custom_roles ucr JOIN public.custom_roles cr ON cr.id = ucr.role_id
         WHERE ucr.profile_id = v_profile_id AND cr.name = v_req.step_role
           AND cr.is_approval_slot = true AND cr.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'You are not allowed to reject this order';
  END IF;

  UPDATE public.sale_order_approvals
  SET    status = 'rejected', decided_by = v_profile_id, decided_by_name = v_full_name, reason = p_reason
  WHERE  id = p_request_id;

  UPDATE public.sale_order_approvals
  SET    status = 'rejected', reason = 'Cancelled — sibling step rejected'
  WHERE  source_id = v_req.source_id AND approval_type = 'service_order'
    AND  iteration = v_req.iteration AND status = 'pending' AND id <> p_request_id;

  UPDATE public.orders SET status = 'cancelled'::order_status WHERE id = v_req.source_id;
  DELETE FROM public.order_team_assignments WHERE order_id = v_req.source_id;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
