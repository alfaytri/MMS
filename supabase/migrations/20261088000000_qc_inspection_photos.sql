-- QC inspections: let the Quality Analyst attach photos when submitting.
--   • qc_inspections.photo_urls  — the QA's evidence photos (public URLs in the
--     visit-completions bucket, same as the field-completion flow).
--   • rpc_qc_submit_inspection gains p_photo_urls (old 3-arg form dropped so there
--     is a single overload).
--   • get_qc_inspections returns photo_urls so the Ops reviewer sees them.

ALTER TABLE public.qc_inspections
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}'::text[];

DROP FUNCTION IF EXISTS public.rpc_qc_submit_inspection(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.rpc_qc_submit_inspection(
  p_inspection_id uuid, p_findings text DEFAULT NULL, p_scores jsonb DEFAULT NULL, p_photo_urls text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_insp       RECORD;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  SELECT * INTO v_insp FROM public.qc_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection not found'; END IF;
  IF v_insp.status <> 'pending_analyst' THEN RAISE EXCEPTION 'Inspection is not awaiting the analyst (status: %).', v_insp.status; END IF;

  IF NOT public._auth_user_has_permission('qc.analyst')
     AND NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'You are not allowed to submit QC inspections.';
  END IF;
  IF v_insp.analyst_id IS NOT NULL AND v_insp.analyst_id <> v_profile_id
     AND NOT public._auth_user_has_permission('qc.manager') THEN
    RAISE EXCEPTION 'This inspection is assigned to another analyst.';
  END IF;

  UPDATE public.qc_inspections
     SET status = 'pending_manager',
         findings = COALESCE(p_findings, findings),
         scores = COALESCE(p_scores, scores),
         photo_urls = COALESCE(p_photo_urls, photo_urls),
         analyst_id = COALESCE(analyst_id, v_profile_id)
   WHERE id = p_inspection_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rpc_qc_submit_inspection(uuid, text, jsonb, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_qc_inspections(p_scope text DEFAULT 'mine')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile_id uuid;
  v_result     jsonb;
BEGIN
  SELECT id INTO v_profile_id FROM public.user_data WHERE auth_user_id = auth.uid();

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT i.id, i.order_id, i.stage, i.points, i.breakdown, i.timing, i.status,
           i.inspection_date, i.analyst_id, i.findings, i.reject_reason, i.photo_urls,
           i.created_at, i.decided_at,
           o.order_id AS order_number, o.division, o.scheduled_date,
           sc.name AS customer_name,
           an.full_name AS analyst_name
    FROM public.qc_inspections i
    JOIN public.orders o ON o.id = i.order_id
    LEFT JOIN public.service_customers sc ON sc.id = o.service_customer_id
    LEFT JOIN public.user_data an ON an.id = i.analyst_id
    WHERE
      CASE
        WHEN p_scope = 'mine'   THEN i.analyst_id = v_profile_id AND i.status = 'pending_analyst'
        WHEN p_scope = 'review' THEN i.status = 'pending_manager'
        WHEN p_scope = 'open'   THEN i.status IN ('pending_analyst','pending_manager')
        ELSE true
      END
  ) x;

  RETURN v_result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_qc_inspections(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
