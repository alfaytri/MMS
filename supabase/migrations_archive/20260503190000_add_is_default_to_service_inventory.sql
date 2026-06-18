-- Marks one supply option as the pre-selected default within a "select one" group.
-- is_option distinguishes fixed required items from selectable alternatives.

BEGIN;

ALTER TABLE service_inventory
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

COMMIT;
