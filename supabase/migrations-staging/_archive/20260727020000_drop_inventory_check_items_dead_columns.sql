-- Section 1.13 — Drop dead columns on inventory_check_items
--
-- Removes 3 columns that the audit confirmed are dead or redundant:
--   * notes                  — no writer, no reader anywhere
--   * assigned_profile_name  — snapshot on insert; no reader
--   * assigned_profile_id    — always written alongside assignment_id; the sole
--                              consumer is a fallback lookup in
--                              WhInventoryCheckDetail that will now match on
--                              assignment_id only.
--
-- Pre-flight backfill: if any legacy rows have assignment_id IS NULL AND
-- assigned_profile_id IS NOT NULL, try to resolve assignment_id from
-- inventory_check_assignments by (check_id, profile_id) before dropping the
-- column. Any rows that can't be resolved keep assignment_id NULL and will
-- appear under "unmatched" in the UI (previous fallback behaviour was
-- identical for rows where profile_id also didn't resolve).

BEGIN;

-- 1) Backfill assignment_id from a matching assignment where possible.
UPDATE public.inventory_check_items i
   SET assignment_id = a.id
  FROM public.inventory_check_assignments a
 WHERE i.assignment_id IS NULL
   AND i.assigned_profile_id IS NOT NULL
   AND a.check_id = i.check_id
   AND a.profile_id = i.assigned_profile_id;

-- 2) Drop the FK on assigned_profile_id before dropping the column.
ALTER TABLE public.inventory_check_items
    DROP CONSTRAINT IF EXISTS inventory_check_items_assigned_profile_id_fkey;

-- 3) Drop the three dead columns.
ALTER TABLE public.inventory_check_items
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS assigned_profile_name,
    DROP COLUMN IF EXISTS assigned_profile_id;

COMMIT;
