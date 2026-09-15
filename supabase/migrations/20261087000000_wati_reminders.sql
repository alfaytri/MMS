-- QC/Messaging Part B — B3: month-based service reminders (WhatsApp).
--
-- Reuses the existing WATI send layer (sendWatiTemplate → api-wati Edge Function
-- → chat_messages logging). This migration adds only the reminder-specific bits:
--   • reminder_templates  — a small reusable set: name + WATI template + interval
--     in MONTHS. Services point to one (sharing a template groups services).
--   • services.reminder_template_id — per-service assignment (nullable = no reminder).
--   • reminder_sends       — dedup + audit log (don't re-ping a customer within the
--     interval).
--   • app_settings 'reminder_config' — { enabled, test_number }. DEV SAFETY: every
--     reminder send is LOCKED to the test number so real customers are never
--     messaged from dev; clear test_number to go live.
--
-- The daily job is /api/cron/reminders (NOT registered in vercel.json — dev-only,
-- triggered manually). Confirmation + invoice sends are unchanged (they already
-- send WhatsApp templates today).

-- ── Reminder templates (managed centrally; many services share one) ──
CREATE TABLE IF NOT EXISTS public.reminder_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  wati_template_name text,                       -- assigned from the WATI template picker
  interval_months    int  NOT NULL DEFAULT 12,
  param_names        jsonb NOT NULL DEFAULT '["customer_name","service_name"]'::jsonb,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_templates_interval_chk CHECK (interval_months >= 1)
);
ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_templates_rw ON public.reminder_templates;
CREATE POLICY reminder_templates_rw ON public.reminder_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Per-service assignment ──
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS reminder_template_id uuid REFERENCES public.reminder_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_reminder_template ON public.services(reminder_template_id);

-- ── Send log (dedup + audit) ──
CREATE TABLE IF NOT EXISTS public.reminder_sends (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_template_id uuid REFERENCES public.reminder_templates(id) ON DELETE SET NULL,
  service_id           uuid,
  service_customer_id  uuid,
  to_number            text,
  wati_msg_id          text,
  status               text NOT NULL DEFAULT 'sent',   -- sent | failed | skipped
  detail               text,
  sent_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminder_sends_dedup ON public.reminder_sends(service_id, service_customer_id, sent_at);
ALTER TABLE public.reminder_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_sends_rw ON public.reminder_sends;
CREATE POLICY reminder_sends_rw ON public.reminder_sends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Config (DEV: locked to the test number) ──
INSERT INTO public.app_settings (key, value)
VALUES ('reminder_config', jsonb_build_object('enabled', true, 'test_number', '97472195504'))
ON CONFLICT (key) DO NOTHING;

-- ── Due-reminders engine: customers whose last completed service + the
--    template's interval has passed, not already reminded within the interval. ──
CREATE OR REPLACE FUNCTION public.get_due_reminders()
RETURNS TABLE(
  service_id uuid, service_name text, service_customer_id uuid, customer_name text, phone text,
  reminder_template_id uuid, wati_template_name text, param_names jsonb,
  interval_months int, last_service_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT s.id, s.name_en, o.service_customer_id, sc.name,
         (SELECT p.phone FROM public.service_customer_phones p
           WHERE p.customer_id = o.service_customer_id
           ORDER BY p.is_primary DESC NULLS LAST, p.created_at LIMIT 1),
         rt.id, rt.wati_template_name, rt.param_names, rt.interval_months,
         MAX(o.completed_at)::date
  FROM public.services s
  JOIN public.reminder_templates rt
    ON rt.id = s.reminder_template_id AND rt.active AND COALESCE(rt.wati_template_name,'') <> ''
  JOIN public.order_services os ON os.service_id = s.id
  JOIN public.orders o ON o.id = os.order_id AND o.status = 'completed' AND o.completed_at IS NOT NULL
  JOIN public.service_customers sc ON sc.id = o.service_customer_id
  WHERE s.status = 'active' AND s.reminder_template_id IS NOT NULL
  GROUP BY s.id, s.name_en, o.service_customer_id, sc.name, rt.id, rt.wati_template_name, rt.param_names, rt.interval_months
  HAVING MAX(o.completed_at) <= now() - make_interval(months => rt.interval_months)
     AND NOT EXISTS (
       SELECT 1 FROM public.reminder_sends rs
       WHERE rs.service_id = s.id AND rs.service_customer_id = o.service_customer_id
         AND rs.status = 'sent'
         AND rs.sent_at > now() - make_interval(months => rt.interval_months)
     );
$function$;
GRANT EXECUTE ON FUNCTION public.get_due_reminders() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
