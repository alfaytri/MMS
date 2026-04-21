ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS body_text TEXT;
