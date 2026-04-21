-- ═══════════════════════════════════════════════════════════
-- Seed: notification_config rows + body_text values
-- Safe pattern: all inserts are guarded by EXISTS checks on
-- notification_templates, so this migration succeeds even if
-- templates have not been populated yet (rows simply skipped).
-- Re-runnable: ON CONFLICT (slug) DO NOTHING on config rows.
-- ═══════════════════════════════════════════════════════════

-- ─── body_text updates (best-effort, affect 0 rows if template absent) ───

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your booking for {{2}} has been confirmed for {{3}} at {{4}}. Our team will arrive as scheduled. For enquiries call {{5}}.'
WHERE slug = 'booking_confirmation';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, this is a reminder that your {{2}} service is scheduled for tomorrow, {{3}} at {{4}}. Please ensure access is available.'
WHERE slug = 'booking_reminder';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your {{2}} service visit has been completed on {{3}}. Thank you for choosing us. Please rate your experience: {{4}}'
WHERE slug = 'visit_completed';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your technician is on the way and will arrive in approximately {{2}} minutes for your {{3}} service.'
WHERE slug = 'technician_en_route';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your service contract {{2}} has been activated and is valid from {{3}} to {{4}}. Thank you for trusting us.'
WHERE slug = 'contract_activated';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your contract {{2}} will expire on {{3}}. Please contact us at {{4}} to discuss renewal options.'
WHERE slug = 'contract_expiry_reminder';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, invoice {{2}} for QAR {{3}} is due on {{4}}. Please arrange payment at your earliest convenience.'
WHERE slug = 'invoice_due_reminder';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, we have received your payment of QAR {{2}} for invoice {{3}}. Thank you!'
WHERE slug = 'payment_received';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, your payment of QAR {{2}} is overdue since {{3}}. Please contact us immediately to avoid service interruption.'
WHERE slug = 'payment_overdue';

UPDATE notification_templates
SET body_text = 'Dear {{1}}, a system update has been applied. {{2}} Please contact support if you have any questions.'
WHERE slug = 'system_alert';

-- ─── notification_config rows ───
-- Each INSERT is wrapped in a DO block that checks the template exists.
-- If the template slug is not in notification_templates, the row is skipped.

DO $$
BEGIN
  -- ── BOOKING CATEGORY ──────────────────────────────────────

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'booking_confirmation') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('booking_confirmed',
       'Booking Confirmed',
       'تأكيد الحجز',
       'booking',
       'event',
       'Sent immediately when an order is confirmed',
       'booking_confirmation',
       true, 10,
       'Triggered on order status change to confirmed')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'booking_reminder') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('booking_reminder_24h',
       'Booking Reminder — 24 Hours',
       'تذكير الحجز — 24 ساعة',
       'booking',
       'scheduled',
       'Sent 24 hours before the scheduled service date',
       'booking_reminder',
       true, 20,
       'Scheduled job runs daily and sends for next-day orders')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ── VISIT CATEGORY ────────────────────────────────────────

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'technician_en_route') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('visit_technician_en_route',
       'Technician En Route',
       'الفني في الطريق',
       'visit',
       'manual',
       'Sent manually when technician departs for the job',
       'technician_en_route',
       true, 30,
       'Dispatched from the team leader mobile app or by ops staff')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'visit_completed') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('visit_completed',
       'Visit Completed',
       'تمت الزيارة',
       'visit',
       'event',
       'Sent when the order status changes to completed',
       'visit_completed',
       true, 40,
       'Triggered on order status change to completed')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ── CONTRACT CATEGORY ─────────────────────────────────────

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'contract_activated') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('contract_activated',
       'Contract Activated',
       'تفعيل العقد',
       'contract',
       'event',
       'Sent immediately when a contract becomes active',
       'contract_activated',
       true, 50,
       'Triggered when contract status is set to active')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'contract_expiry_reminder') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('contract_expiry_30d',
       'Contract Expiry Reminder — 30 Days',
       'تذكير انتهاء العقد — 30 يومًا',
       'contract',
       'scheduled',
       'Sent 30 days before the contract end date',
       'contract_expiry_reminder',
       true, 60,
       'Scheduled job runs daily, checks contracts expiring in 30 days'),
      ('contract_expiry_7d',
       'Contract Expiry Reminder — 7 Days',
       'تذكير انتهاء العقد — 7 أيام',
       'contract',
       'scheduled',
       'Sent 7 days before the contract end date',
       'contract_expiry_reminder',
       true, 65,
       'Scheduled job runs daily, checks contracts expiring in 7 days')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ── PAYMENT CATEGORY ──────────────────────────────────────

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'invoice_due_reminder') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('payment_invoice_due_3d',
       'Invoice Due Reminder — 3 Days',
       'تذكير استحقاق الفاتورة — 3 أيام',
       'payment',
       'scheduled',
       'Sent 3 days before invoice due date',
       'invoice_due_reminder',
       true, 70,
       'Scheduled daily job for invoices due in 3 days'),
      ('payment_invoice_overdue',
       'Invoice Overdue Alert',
       'تنبيه الفاتورة المتأخرة',
       'payment',
       'scheduled',
       'Sent on the day the invoice becomes overdue',
       'invoice_due_reminder',
       true, 75,
       'Sent on due-date+1 if still unpaid')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'payment_received') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('payment_received',
       'Payment Received',
       'تم استلام الدفع',
       'payment',
       'event',
       'Sent immediately when a payment is recorded',
       'payment_received',
       true, 80,
       'Triggered on new payment entry for any invoice')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'payment_overdue') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('payment_overdue_followup',
       'Overdue Payment Follow-up',
       'متابعة الدفعة المتأخرة',
       'payment',
       'scheduled',
       'Sent weekly while invoice remains overdue',
       'payment_overdue',
       true, 85,
       'Weekly re-send until payment is recorded or invoice cancelled')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  -- ── SYSTEM CATEGORY ───────────────────────────────────────

  IF EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'system_alert') THEN
    INSERT INTO notification_config
      (slug, label, label_ar, category, trigger_type, timing_description,
       template_slug, is_active, sort_order, notes)
    VALUES
      ('system_alert_general',
       'General System Alert',
       'تنبيه نظام عام',
       'system',
       'manual',
       'Sent manually by admin for system-wide announcements',
       'system_alert',
       true, 90,
       'Used for maintenance windows, outages, or broadcast messages')
    ON CONFLICT (slug) DO NOTHING;
  END IF;

END $$;
