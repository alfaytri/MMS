-- ============================================================
-- Drop unused activity_log.ip_address column
--
-- Context: audited across the codebase — nothing writes to this
-- column. The only reader is AuditDetailDialog.tsx, which just
-- rendered "—" for every row because the column has always been
-- NULL. For an internal LAN-only app the field has no business
-- value (all users hit from the office gateway; performer_id
-- already answers "who did it"). Dropping the column and the UI
-- row it powered.
-- ============================================================

ALTER TABLE public.activity_log
  DROP COLUMN IF EXISTS ip_address;

NOTIFY pgrst, 'reload schema';
