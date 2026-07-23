-- ============================================================
-- Drop columns from company_divisions that staging doesn't use
--
-- calendar_schedule_id: calendar/scheduling module not in staging
-- css_classes: never used in any code path (only test fixtures)
-- ============================================================

ALTER TABLE public.company_divisions
  DROP COLUMN IF EXISTS calendar_schedule_id;

ALTER TABLE public.company_divisions
  DROP COLUMN IF EXISTS css_classes;
