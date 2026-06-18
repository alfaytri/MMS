-- Allow each division to have an assigned calendar schedule.
-- When set, the calendar will use the division's schedule hours
-- instead of the global app_settings.calendar_schedule.

ALTER TABLE divisions
  ADD COLUMN calendar_schedule_id UUID
    REFERENCES schedules(id) ON DELETE SET NULL;
