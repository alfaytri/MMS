-- Part 1: Add 'booking' to notification_category enum.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction,
-- and the new value must be fully committed before it can be
-- used in a USING cast, so this is a separate migration.

ALTER TYPE public.notification_category ADD VALUE IF NOT EXISTS 'booking';
