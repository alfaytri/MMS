-- WATI Template Management: seed the notification_config + notification_templates
-- rows for booking-confirmation and order-invoice so the central sendWatiTemplate
-- helper + the admin template picker have a load-bearing source of truth.
--
-- Idempotent (WHERE NOT EXISTS): dev's tables exist but are empty; on any env
-- that already carries these slugs this is a no-op. `order_invoice` starts with
-- NO wati_template_name — the operator assigns its approved template in the
-- Services → Notifications admin picker.
BEGIN;

INSERT INTO public.notification_templates (slug, wati_template_name, media_type, param_count, param_names, is_active, description)
SELECT 'booking_confirmation', 'normal_booking_conformation_utility', 'document', 5,
       '["booking_number","date","time","address_label","address_link"]'::jsonb, true,
       'Booking confirmation sent ~2 days before the visit (header = confirmation PDF).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE slug = 'booking_confirmation');

INSERT INTO public.notification_templates (slug, wati_template_name, media_type, param_count, param_names, is_active, description)
SELECT 'order_invoice', '', 'document', 6,
       '["invoice_number","customer_name","total","paid","pending","pay_link"]'::jsonb, true,
       'Order invoice sent to the customer on invoice creation (header = invoice PDF; includes a Dibsy pay link).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE slug = 'order_invoice');

INSERT INTO public.notification_config (slug, label, label_ar, category, trigger_type, template_slug, is_active, timing_description, notes, sort_order)
SELECT 'booking_confirmation', 'Booking Confirmation', 'تأكيد الحجز', 'booking', 'event', 'booking_confirmation', true,
       'On order create when the visit is <=2 days away, else the daily cron 2 days before.',
       'Sends the confirmation PDF + visit details to the customer.', 10
WHERE NOT EXISTS (SELECT 1 FROM public.notification_config WHERE slug = 'booking_confirmation');

INSERT INTO public.notification_config (slug, label, label_ar, category, trigger_type, template_slug, is_active, timing_description, notes, sort_order)
SELECT 'order_invoice', 'Order Invoice', 'فاتورة الطلب', 'invoice', 'event', 'order_invoice', true,
       'Immediately when a team-leader order invoice is created.',
       'Sends the invoice PDF + amounts + a Dibsy pay link for any pending balance.', 20
WHERE NOT EXISTS (SELECT 1 FROM public.notification_config WHERE slug = 'order_invoice');

-- Restore the FK PostgREST embeds through (notification_config → templates).
-- Missing on the dev DB (schema drift); present on staging/new-prod. Added AFTER
-- the seeds so every existing template_slug already resolves. notification_templates.slug
-- is UNIQUE, so it's a valid FK target.
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_config_template_slug_fkey') THEN
    ALTER TABLE public.notification_config
      ADD CONSTRAINT notification_config_template_slug_fkey
      FOREIGN KEY (template_slug) REFERENCES public.notification_templates(slug);
  END IF;
END $fk$;

COMMIT;

NOTIFY pgrst, 'reload schema';
